const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Учёт расходов стройки';

// Категории для автоопределения
const CATEGORIES = {
  'цемент|кирпич|арматура|песок|щебень|блок|бетон|дерево|доска|брус|гвозд|шуруп|краска|штукатурк|плитк|ламинат|обои|утеплител|пенопласт|металл|труб|провод|кабел|розетк|выключател|стекл|окн|двер|замок': 'Материалы',
  'рабочи|рабочих|мастер|бригад|строител|монтаж|сварщик|электрик|плотник|маляр|зарплат|оплат|труд': 'Рабочие',
  'кран|экскаватор|бульдозер|техника|аренд|инструмент|перфоратор|бетономешалк|генератор|леса|подъемник': 'Техника/Аренда',
  'доставк|привез|перевез|машина|газел|камаз|транспорт': 'Доставка',
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [keywords, category] of Object.entries(CATEGORIES)) {
    if (new RegExp(keywords).test(lower)) return category;
  }
  return 'Прочее';
}

function parseMessage(text) {
  const t = text.trim();

  // Извлекаем сумму — первое число в сообщении
  const amountMatch = t.match(/\d[\d\s]*[.,]?\d*/);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[0].replace(/\s/g, '').replace(',', '.'));
  if (!amount || amount <= 0) return null;

  // Описание — всё что после суммы
  const afterAmount = t.slice(t.indexOf(amountMatch[0]) + amountMatch[0].length).trim();
  const description = afterAmount.replace(/[₸тгтенгеруб]/gi, '').trim() || '—';

  const category = detectCategory(text);

  return { amount, category, description };
}

async function appendToSheet(row) {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const date = new Date().toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty' });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:E`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date, row.category, row.description, row.amount, '']],
    },
  });
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const { message } = req.body;
    if (!message?.text) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = message.text;

    // Команда /start
    if (text === '/start') {
      await sendMessage(chatId,
        `👷 <b>Бот учёта расходов стройки</b>\n\n` +
        `Просто напиши сумму и описание:\n\n` +
        `<code>2710 цемент 5 мешков</code>\n` +
        `<code>15000 доставка кирпича</code>\n` +
        `<code>50000 рабочие за неделю</code>\n\n` +
        `Категории: Материалы, Рабочие, Техника/Аренда, Доставка, Прочее\n` +
        `Категория определяется автоматически ✨`
      );
      return res.status(200).json({ ok: true });
    }

    const parsed = parseMessage(text);

    if (!parsed) {
      await sendMessage(chatId,
        `❓ Не понял. Напиши сумму и описание:\n\n` +
        `<code>2710 цемент 5 мешков</code>\n` +
        `<code>50000 рабочие за неделю</code>`
      );
      return res.status(200).json({ ok: true });
    }

    await appendToSheet(parsed);

    await sendMessage(chatId,
      `✅ <b>Записано!</b>\n\n` +
      `💰 Сумма: <b>${parsed.amount.toLocaleString('ru-RU')} ₸</b>\n` +
      `📂 Категория: ${parsed.category}\n` +
      `📝 Описание: ${parsed.description}`
    );

  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({ ok: true });
}
