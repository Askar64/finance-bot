const CATEGORIES = {
  'рабочи|рабочих|мастер|бригад|строител|монтаж|сварщик|электрик|плотник|маляр|зарплат|оплат|труд': 'Рабочие',

  'цемент|кирпич|арматура|песок|щебень|блок|бетон|дерево|доска|брус|гвозд|шуруп|саморез|краска|штукатурк|плитк|ламинат|обои|утеплител|пенопласт|металл|труб|провод|кабел|розетк|выключател|стекл|окн|двер|замок': 'Материалы',

  'кран|экскаватор|бульдозер|техника|аренд|инструмент|перфоратор|бетономешалк|генератор|леса|подъемник': 'Техника/Аренда',

  'доставк|привез|перевез|машина|газел|камаз|транспорт': 'Доставка',
};

function detectCategory(text) {
  const lower = text.toLowerCase();

  for (const [keywords, category] of Object.entries(CATEGORIES)) {
    if (new RegExp(keywords, 'i').test(lower)) {
      return category;
    }
  }

  return 'Прочее';
}

function parseMessage(text) {
  const t = text.trim();

  const amountMatch = t.match(/^\d[\d\s,.]*/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(
    amountMatch[0].replace(/[^\d]/g, '')
  );

  if (!amount || amount <= 0) {
    return null;
  }

  const afterAmount = t.slice(amountMatch[0].length).trim();

  const description = afterAmount
    .replace(/₸/g, '')
    .replace(/\b(тг|тенге|руб|рублей)\b/gi, '')
    .trim() || '—';

  const category = detectCategory(description);

  return {
    amount,
    category,
    description,
  };
}
