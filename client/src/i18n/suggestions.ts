type Suggestion = {
  text: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'any';
  season: 'spring' | 'summer' | 'autumn' | 'winter' | 'any';
  dayType: 'weekday' | 'weekend' | 'any';
};

export const en_US_suggestions: Suggestion[] = [
  // Any time, any context
  { text: 'Come over 🫶', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: "Door's open 🚪", timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Come say hi 👋', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Come hang', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Just hanging', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Hanging at home 🏠', timeOfDay: 'any', season: 'any', dayType: 'any' },

  // Morning
  { text: "Coffee's on ☕", timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Working from home 💻', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },
  { text: 'WFH today', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Morning — weekend
  { text: 'Lazy Sunday', timeOfDay: 'morning', season: 'any', dayType: 'weekend' },

  // Afternoon — general
  { text: 'Making lunch 🍱', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Tea and chill? 🍵', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Snack spread', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Study sesh at mine? 📚', timeOfDay: 'afternoon', season: 'any', dayType: 'weekday' },
  { text: 'TGIF 🎉', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Sunday reset 🧘', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Watching the game', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },

  // Afternoon — summer
  { text: "Backyard's open", timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: "Pool's open 🏊", timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Grilling out 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },

  // Afternoon — spring/summer
  { text: 'Garden hangs? 🌿', timeOfDay: 'afternoon', season: 'spring', dayType: 'any' },

  // Afternoon — autumn/winter
  { text: 'Hot cocoa? ☕', timeOfDay: 'afternoon', season: 'autumn', dayType: 'any' },
  { text: 'Baking something 🍪', timeOfDay: 'afternoon', season: 'autumn', dayType: 'any' },

  // Evening — general
  { text: 'Down to chill 🛋️', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'On the couch 📺', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Chilling tonight', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Cooking dinner 🍝', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Movie at mine? 🎬', timeOfDay: 'evening', season: 'any', dayType: 'any' },

  // Evening — weekend
  { text: 'Game night? 🎮', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
  { text: 'Board games? 🎲', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
  { text: 'Pizza night? 🍕', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },

  // Evening — winter
  { text: 'Netflix night', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
];

export const en_GB_suggestions: Suggestion[] = [
  // Any time
  { text: 'Come over 🫶', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: "Door's open 🚪", timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Fancy a natter?', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Bank holiday chilling', timeOfDay: 'any', season: 'any', dayType: 'weekend' },

  // Morning
  { text: "Kettle's on ☕", timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Cuppa and a chat', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Biscuits out 🍪', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'WFH today', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Morning — weekend
  { text: 'Lazy Sunday', timeOfDay: 'morning', season: 'any', dayType: 'weekend' },

  // Afternoon
  { text: 'Tea and chill? 🍵', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Round of tea?', timeOfDay: 'afternoon', season: 'winter', dayType: 'any' },
  { text: 'Watching the match ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: "Garden's open", timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: "BBQ's on 🔥", timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Garden hangs? 🌿', timeOfDay: 'afternoon', season: 'spring', dayType: 'any' },
  { text: 'Baking something 🍪', timeOfDay: 'afternoon', season: 'autumn', dayType: 'any' },

  // Evening
  { text: 'Movie at mine? 🎬', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Game night? 🎮', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
  { text: 'Cosy night in', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
];

export const de_suggestions: Suggestion[] = [
  // Any time
  { text: 'Komm vorbei!', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Tür ist offen 🚪', timeOfDay: 'any', season: 'any', dayType: 'any' },

  // Morning
  { text: 'Kaffee kocht ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Homeoffice', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Afternoon
  { text: 'Kuchen da 🎂', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Tee kochen? 🍵', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Sonntagsfaul', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Fußball schauen ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Balkon offen ☀️', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },
  { text: 'Grillen heute 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Kakao? ☕', timeOfDay: 'afternoon', season: 'autumn', dayType: 'any' },

  // Evening
  { text: 'Feierabend! 🎉', timeOfDay: 'evening', season: 'any', dayType: 'weekday' },
  { text: 'Gemütlich zuhause', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
  { text: 'Entspannter Abend', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Tatort Abend', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
  { text: 'Film bei mir? 🎬', timeOfDay: 'evening', season: 'any', dayType: 'any' },
];

export const es_suggestions: Suggestion[] = [
  // Any time
  { text: 'Ven a pasar 🫶', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'La puerta está abierta 🚪', timeOfDay: 'any', season: 'any', dayType: 'any' },

  // Morning
  { text: 'Café listo ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Teletrabajando', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Afternoon
  { text: 'Tarde de sofá', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Merienda lista ☕', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Partido en casa ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Domingo relajado', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Hay comida 🍕', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Barbacoa lista 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Piscina abierta 🏊', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Tapas en casa 🫒', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Refrescos fríos 🥤', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },

  // Evening
  { text: 'Noche de peli', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Ven a charlar', timeOfDay: 'evening', season: 'any', dayType: 'any' },
];

export const fr_suggestions: Suggestion[] = [
  // Any time
  { text: 'Viens passer 🫶', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'La porte est ouverte 🚪', timeOfDay: 'any', season: 'any', dayType: 'any' },

  // Morning
  { text: 'Café chaud ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Viens prendre un café', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'En télétravail', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Afternoon
  { text: 'Goûter maison 🧀', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Match à la maison ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Dimanche flemme', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Terrasse ouverte ☀️', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },
  { text: 'Barbecue lancé 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Cuisine en cours 🍳', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Viens grignoter 🧀', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },

  // Evening
  { text: 'Soirée tranquille', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: "Y'a de quoi grignoter 🍕", timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Film à la maison? 🎬', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Fainéantise assumée', timeOfDay: 'any', season: 'winter', dayType: 'weekend' },
];

export const sv_suggestions: Suggestion[] = [
  // Any time
  { text: 'Sväng förbi 🫶', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Dörren är öppen 🚪', timeOfDay: 'any', season: 'any', dayType: 'any' },
  { text: 'Kom in 🏠', timeOfDay: 'any', season: 'any', dayType: 'any' },

  // Morning
  { text: 'Kaffe på ☕', timeOfDay: 'morning', season: 'any', dayType: 'any' },
  { text: 'Jobbar hemifrån 💻', timeOfDay: 'morning', season: 'any', dayType: 'weekday' },

  // Morning — weekend
  { text: 'Lat söndagsmorgon', timeOfDay: 'morning', season: 'any', dayType: 'weekend' },

  // Afternoon
  { text: 'Fika? ☕', timeOfDay: 'afternoon', season: 'any', dayType: 'any' },
  { text: 'Helgmys', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Matchen på tv ⚽', timeOfDay: 'afternoon', season: 'any', dayType: 'weekend' },
  { text: 'Sitter ute ☀️', timeOfDay: 'afternoon', season: 'summer', dayType: 'any' },
  { text: 'Grillat idag 🔥', timeOfDay: 'afternoon', season: 'summer', dayType: 'weekend' },
  { text: 'Bakar 🍪', timeOfDay: 'afternoon', season: 'autumn', dayType: 'any' },

  // Evening
  { text: 'Fredagsmys 🎉', timeOfDay: 'evening', season: 'any', dayType: 'weekend' },
  { text: 'Film hemma? 🎬', timeOfDay: 'evening', season: 'any', dayType: 'any' },
  { text: 'Myskvällen 🛋️', timeOfDay: 'evening', season: 'winter', dayType: 'any' },
  { text: 'Lagar mat 🍝', timeOfDay: 'evening', season: 'any', dayType: 'any' },
];

function getSeason(month: number): 'spring' | 'summer' | 'autumn' | 'winter' {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
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
  const lang = (locale ?? '').split('-')[0];

  if (locale === 'en-GB') {
    pool = en_GB_suggestions;
  } else if (lang === 'de') {
    pool = de_suggestions;
  } else if (lang === 'es') {
    pool = es_suggestions;
  } else if (lang === 'fr') {
    pool = fr_suggestions;
  } else if (lang === 'sv') {
    pool = sv_suggestions;
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
