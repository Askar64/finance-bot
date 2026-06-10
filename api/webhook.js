const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Лист1';

// Категории для автоопределения
const EXPENSE_CATEGORIES = {
  'еда|кафе|ресторан|обед|ужин|завтрак|продукты|магазин|супермаркет|vitamart|market': 'Еда',
  'такси|убер|яндекс|транспорт|автобус|метро|бензин|парковка': 'Транспорт',
  'аптека|врач|здоровье|лечение|медицина': 'Здоровье',
  'одежда|обувь|шоппинг': 'Одежда',
  'связь|телефон|интернет': 'Связь',
  'подписка|netflix|spotify|canva|make|vercel': 'Подписки',
  'коммуналка|свет|газ|вода|квартира|аренда': 'Коммуналка',
  'развлечения|кино|игры|бар': 'Развлечения',
  'сигарет|табак|алкоголь|пиво': 'Личное',
};

const INCOME_CATEGORIES = {
  'студия|дизайн|проект|визуализация|интерьер|предоплата|оплата': 'Студия',
  'страхование|авр|счет|номад|иншуранс': 'Страхование',
  'зарплата|salary': 'Зарплата',
  'фриланс|заказ': 'Фриланс',
};

function detectCategory(text, isExpense) {
  const lower = text.toLowerCase();
  const categories = isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  for (const [keywords, category] of Object.entries(categories)) {
    if (new RegExp(keywords).test(lower)) return category;
  }
  return isExpense ? 'Прочие расходы' : 'Прочие доходы';
}

function parseMessage(text) {
  const lower = text.toLowerCase().trim();

  // Определяем тип
  let type = null;
  if (/^(расход|трата|потратил|купил|покупка|минус)/.test(lower)) type = 'Расход';
  else if (/^(доход|получил|заработал|пришло|плюс|поступление)/.test(lower)) type = 'Доход';

  if (!type) return null;

  // Извлекаем сумму (число с возможными пробелами и символами ₸, тг, тенге, руб)
  const amountMatch = text.match(/[\d\s]+[.,]?\d*/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[0].replace(/\s/g, '').replace(',', '.'));
  if (!amount || amount <= 0) return null;

  // Описание — всё что после суммы
  const afterAmount = text.slice(text.indexOf(amountMatch[0]) + amountMatch[0].length).trim();
  const description = afterAmount.replace(/[₸тгтенгеруб\.]/gi, '').trim() || '—';

  const category = detectCategory(text, type === 'Расход');

  return { type, amount, category, description };
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
    range: `${SHEET_NAME}!A:F`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[date, row.type, row.category, row.description, row.amount, '']],
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
        `👋 <b>Бот учёта финансов</b>\n\nФормат сообщений:\n\n` +
        `<b>Расход:</b>\n<code>расход 2710 еда сигареты и жвачка</code>\n\n` +
        `<b>Доход:</b>\n<code>доход 150000 студия предоплата за проект</code>\n\n` +
        `Категория определяется автоматически ✨`
      );
      return res.status(200).json({ ok: true });
    }

    const parsed = parseMessage(text);

    if (!parsed) {
      await sendMessage(chatId,
        `❓ Не понял формат. Попробуй:\n\n` +
        `<code>расход 5000 кафе обед</code>\n` +
        `<code>доход 200000 студия оплата проекта</code>`
      );
      return res.status(200).json({ ok: true });
    }

    await appendToSheet(parsed);

    const emoji = parsed.type === 'Расход' ? '🔴' : '🟢';
    await sendMessage(chatId,
      `${emoji} <b>${parsed.type} записан!</b>\n\n` +
      `💰 Сумма: <b>${parsed.amount.toLocaleString('ru-RU')} ₸</b>\n` +
      `📂 Категория: ${parsed.category}\n` +
      `📝 Описание: ${parsed.description}`
    );

  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({ ok: true });
}
