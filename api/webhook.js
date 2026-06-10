const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Учёт расходов стройки';

const ALLOWED_CHAT_IDS = (process.env.ALLOWED_CHAT_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const CATEGORIES = {
  'рабочи|рабочих|мастер|бригад|строител|монтаж|сварщик|электрик|плотник|маляр|зарплат|оплат|труд': 'Рабочие',
  'цемент|кирпич|арматура|песок|щебень|блок|бетон|дерево|доска|брус|гвозд|шуруп|саморез|краска|штукатурк|плитк|ламинат|обои|утеплител|пенопласт|металл|труб|провод|кабел|розетк|выключател|стекл|окн|двер|замок|клей': 'Материалы',
  'кран|экскаватор|бульдозер|техника|аренд|инструмент|перфоратор|бетономешалк|генератор|леса|подъемник': 'Техника/Аренда',
  'доставк|привез|перевез|машина|газел|камаз|транспорт': 'Доставка',
};

function detectCategory(text) {
  const lower = text.toLowerCase();

  for (const [keywords, category] of Object.entries(CATEGORIES)) {
    if (new RegExp(keywords, 'i').test(lower)) return category;
  }

  return 'Прочее';
}

function parseMessage(text) {
  const t = text.trim();
  const amountMatch = t.match(/^\d[\d\s,.]*/);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[0].replace(/[^\d]/g, ''));
  if (!amount || amount <= 0) return null;

  const afterAmount = t.slice(amountMatch[0].length).trim();

  const description =
    afterAmount
      .replace(/₸/g, '')
      .replace(/\b(тг|тенге|руб|рублей)\b/gi, '')
      .trim() || '—';

  const category = detectCategory(description);

  return { amount, category, description };
}

function getDate() {
  return new Date().toLocaleDateString('ru-RU', {
    timeZone: 'Asia/Almaty',
  });
}

async function getSheetsClient() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

async function appendToSheet(row) {
  const sheets = await getSheetsClient();
  const date = getDate();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date, row.category, row.description, row.amount, '']],
    },
  });
}

async function getRows() {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:E`,
  });

  return response.data.values || [];
}

function parseAmount(value) {
  return Number(String(value || '').replace(/[^\d]/g, '')) || 0;
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
}

function formatMoney(amount) {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const { message } = req.body;

    if (!message?.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (
      ALLOWED_CHAT_IDS.length > 0 &&
      !ALLOWED_CHAT_IDS.includes(String(chatId))
    ) {
      await sendMessage(chatId, '⛔ Доступ запрещён');
      return res.status(200).json({ ok: true });
    }

    if (text === '/id') {
      await sendMessage(chatId, `Ваш Telegram ID: ${chatId}`);
      return res.status(200).json({ ok: true });
    }

    if (text === '/start') {
      await sendMessage(
        chatId,
        `👷 <b>Бот учёта расходов стройки</b>\n\n` +
          `Добавить расход:\n` +
          `<code>2710 цемент 5 мешков</code>\n` +
          `<code>15000 доставка кирпича</code>\n` +
          `<code>50000 рабочие за неделю</code>\n\n` +
          `Команды:\n` +
          `/total — общая сумма\n` +
          `/today — расходы за сегодня\n` +
          `/list — последние 10 расходов\n` +
          `/id — узнать Telegram ID`
      );

      return res.status(200).json({ ok: true });
    }

    if (text === '/total') {
      const rows = await getRows();
      const total = rows.reduce((sum, row) => sum + parseAmount(row[3]), 0);

      await sendMessage(
        chatId,
        `💰 <b>Общие расходы:</b>\n${formatMoney(total)}`
      );

      return res.status(200).json({ ok: true });
    }

    if (text === '/today') {
      const rows = await getRows();
      const today = getDate();

      const todayRows = rows.filter(row => row[0] === today);
      const total = todayRows.reduce((sum, row) => sum + parseAmount(row[3]), 0);

      await sendMessage(
        chatId,
        `📅 <b>Расходы за сегодня:</b>\n` +
          `${formatMoney(total)}\n\n` +
          `Количество записей: ${todayRows.length}`
      );

      return res.status(200).json({ ok: true });
    }

    if (text === '/list') {
      const rows = await getRows();
      const lastRows = rows.slice(-10).reverse();

      if (lastRows.length === 0) {
        await sendMessage(chatId, 'Пока расходов нет.');
        return res.status(200).json({ ok: true });
      }

      const list = lastRows
        .map(row => {
          const date = row[0] || '';
          const category = row[1] || '';
          const description = row[2] || '';
          const amount = formatMoney(parseAmount(row[3]));

          return `• ${date} — <b>${amount}</b>\n  ${category}: ${description}`;
        })
        .join('\n\n');

      await sendMessage(chatId, `📋 <b>Последние расходы:</b>\n\n${list}`);

      return res.status(200).json({ ok: true });
    }

    const parsed = parseMessage(text);

    if (!parsed) {
      await sendMessage(
        chatId,
        `❓ Не понял. Напиши сумму и описание:\n\n` +
          `<code>2710 цемент 5 мешков</code>\n` +
          `<code>50000 рабочие за неделю</code>`
      );

      return res.status(200).json({ ok: true });
    }

    await appendToSheet(parsed);

    await sendMessage(
      chatId,
      `✅ <b>Записано!</b>\n\n` +
        `💰 Сумма: <b>${formatMoney(parsed.amount)}</b>\n` +
        `📂 Категория: ${parsed.category}\n` +
        `📝 Описание: ${parsed.description}`
    );
  } catch (err) {
    console.error('BOT ERROR:', err);
  }

  return res.status(200).json({ ok: true });
}
