type Suggestion = {
  text: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any';
  season: 'summer' | 'winter' | 'any';
  dayType: 'weekday' | 'weekend' | 'any';
};

export const en_US_suggestions: Suggestion[] = [
  { text: 'Coffee\'s on ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Working from home', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'WFH today', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'Backyard\'s open', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Watching the game', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Pool\'s open 🏊', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Beers in the fridge 🍺', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Netflix night', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
  { text: 'Chilling tonight', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Just hanging', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Door\'s literally open', timeOfDay: 'any', season: 'summer', dayType: 'any' },
  { text: 'Come hang', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Grilling out 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Lazy Sunday', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Snack spread 🍕', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
];

export const en_GB_suggestions: Suggestion[] = [
  { text: 'Kettle\'s on ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Watching the match ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Garden\'s open', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Cuppa and a chat', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Pub vibes at home 🍺', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Lazy Sunday', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'WFH today', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'Bank holiday chilling', timeOfDay: 'any', season: 'any', dayType: 'weekend' },
  { text: 'Biscuits out 🍪', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Round of tea?', timeOfDay: 'any', season: 'winter', dayType: 'any' },
  { text: 'BBQ\'s on 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Fancy a natter?', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Cosy night in', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
];

export const de_suggestions: Suggestion[] = [
  { text: 'Kaffee kocht ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Feierabend! 🍺', timeOfDay: 'evening', season: 'any', dayType: 'weekday' },
  { text: 'Grillen heute 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Homeoffice', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'Gemütlich zuhause', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
  { text: 'Fußball schauen ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Kuchen da 🎂', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Sonntagsfaul', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Entspannter Abend', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Komm vorbei!', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Balkon offen ☀️', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },
  { text: 'Bier kalt 🍺', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Tatort Abend', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
];

export const es_suggestions: Suggestion[] = [
  { text: 'Café listo ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Tarde de sofá', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Barbacoa lista 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Teletrabajando', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'Partido en casa ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Vermut abierto 🍷', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Noche de peli', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Domingo relajado', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Hay comida 🍕', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Ven a charlar', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Cervezas frías 🍺', timeOfDay: 'evening', season: 'summer', dayType: 'any' },
  { text: 'Piscina abierta 🏊', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Tapas en casa 🫒', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
];

export const fr_suggestions: Suggestion[] = [
  { text: 'Café chaud ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Apéro ouvert 🍷', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Barbecue lancé 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'En télétravail', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'Match à la maison ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Soirée tranquille', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Dimanche flemme', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Y\'a des bières 🍺', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Viens prendre un café', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Fainéantise assumée', timeOfDay: 'any', season: 'winter', dayType: 'weekend' },
  { text: 'Terrasse ouverte ☀️', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },
  { text: 'Cuisine en cours 🍳', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Viens grignoter 🧀', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
];

function getSeason(month: number): 'summer' | 'winter' {
  // Northern hemisphere: summer = June–August, winter = December–February
  if (month >= 6 && month <= 8) return 'summer';
  if (month === 12 || month <= 2) return 'winter';
  return 'summer'; // spring/autumn treated as neutral, default to summer scoring
}

function getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function getDayType(dayOfWeek: number): 'weekday' | 'weekend' {
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';
}

export function getSuggestions(locale: string): string[] {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1; // 1-indexed
  const dayOfWeek = now.getDay(); // 0 = Sunday

  const currentTimeOfDay = getTimeOfDay(hour);
  const currentSeason = getSeason(month);
  const currentDayType = getDayType(dayOfWeek);

  let pool: Suggestion[];
  const lang = locale.split('-')[0];

  if (locale === 'en-GB') {
    pool = en_GB_suggestions;
  } else if (lang === 'de') {
    pool = de_suggestions;
  } else if (lang === 'es') {
    pool = es_suggestions;
  } else if (lang === 'fr') {
    pool = fr_suggestions;
  } else {
    pool = en_US_suggestions;
  }

  const scored = pool.map(s => {
    let score = 0;
    if (s.timeOfDay === currentTimeOfDay) score += 2;
    if (s.season === currentSeason) score += 1;
    if (s.dayType === currentDayType) score += 1;
    // 'any' fields don't add score but don't penalise either
    return { ...s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 7).map(s => s.text);
}
