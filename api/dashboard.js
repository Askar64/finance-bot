const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Учёт расходов стройки';

const DASHBOARD_KEY = process.env.DASHBOARD_KEY || '1234';

async function getRows() {
  const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({
    version: 'v4',
    auth,
  });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:E`,
  });

  return response.data.values || [];
}

function formatMoney(amount) {
  return amount.toLocaleString('ru-RU') + ' ₸';
}

export default async function handler(req, res) {
  const { key } = req.query;

  if (key !== DASHBOARD_KEY) {
    return res.status(403).send('Доступ запрещён');
  }

  try {
    const rows = await getRows();

    let total = 0;

    const categories = {
      'Материалы': 0,
      'Рабочие': 0,
      'Доставка': 0,
      'Техника/Аренда': 0,
      'Прочее': 0,
    };

    rows.forEach(row => {
      const amount =
        Number(String(row[3] || '').replace(/[^\d]/g, '')) || 0;

      total += amount;

      const category = row[1];

      if (categories[category] !== undefined) {
        categories[category] += amount;
      }
    });

    const lastRows = rows.slice(-20).reverse();

    const expensesHtml = lastRows
      .map(row => {
        const date = row[0] || '';
        const category = row[1] || '';
        const description = row[2] || '';
        const amount = formatMoney(
          Number(String(row[3] || '').replace(/[^\d]/g, '')) || 0
        );

        return `
          <tr>
            <td>${date}</td>
            <td>${category}</td>
            <td>${description}</td>
            <td>${amount}</td>
          </tr>
        `;
      })
      .join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Расходы стройки</title>

<style>
body{
font-family:Arial,sans-serif;
background:#f5f5f5;
margin:0;
padding:20px;
}

.card{
background:white;
padding:20px;
border-radius:12px;
margin-bottom:15px;
box-shadow:0 2px 8px rgba(0,0,0,.08);
}

.total{
font-size:32px;
font-weight:bold;
color:#1f7a1f;
}

table{
width:100%;
border-collapse:collapse;
background:white;
}

th,td{
padding:10px;
border-bottom:1px solid #eee;
text-align:left;
}

th{
background:#fafafa;
}

@media(max-width:700px){
table{
font-size:13px;
}
}
</style>
</head>

<body>

<div class="card">
<h2>🏗 Расходы стройки</h2>
<div class="total">${formatMoney(total)}</div>
</div>

<div class="card">
<h3>По категориям</h3>

<p>📦 Материалы: <b>${formatMoney(categories['Материалы'])}</b></p>
<p>👷 Рабочие: <b>${formatMoney(categories['Рабочие'])}</b></p>
<p>🚚 Доставка: <b>${formatMoney(categories['Доставка'])}</b></p>
<p>🛠 Техника: <b>${formatMoney(categories['Техника/Аренда'])}</b></p>
<p>📌 Прочее: <b>${formatMoney(categories['Прочее'])}</b></p>
</div>

<div class="card">
<h3>Последние расходы</h3>

<table>
<tr>
<th>Дата</th>
<th>Категория</th>
<th>Описание</th>
<th>Сумма</th>
</tr>

${expensesHtml}

</table>

</div>

</body>
</html>
`);
  } catch (err) {
    console.error(err);
    return res.status(500).send('Ошибка');
  }
}
