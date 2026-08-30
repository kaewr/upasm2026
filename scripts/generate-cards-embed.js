#!/usr/bin/env node
// Regenerates the card data embedded in cards.html and sodium-quest-mvp.html
// from the 5 root *_cards_full.json files (the single source of truth for
// card content). Run this after editing any card's text/data in the JSON
// files, before committing, so both HTML files stay byte-for-byte in sync
// with the JSON and with each other.
//
// Usage:  node scripts/generate-cards-embed.js
//
// This is a plain content-sync utility, not a build step — the two HTML
// files it writes are still complete, self-contained static pages; nothing
// about how the game is played, hosted, or opened changes.
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DECKS = {
  food:      'food_menu_cards_full.json',
  mission:   'mission_cards_full.json',
  obstacle:  'obstacle_cards_full.json',
  support:   'support_cards_full.json',
  knowledge: 'knowledge_cards_full.json',
};
// The live game's runtime variable names for the same 5 decks.
const RUNTIME_VAR_NAMES = {
  mission: 'MISSIONS',
  food: 'FOOD',
  knowledge: 'KNOWLEDGE',
  obstacle: 'OBSTACLES',
  support: 'SUPPORT',
};

function loadDeckCards(fileName){
  const filePath = path.join(PROJECT_ROOT, fileName);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if(!Array.isArray(parsed.cards)) throw new Error(`${fileName}: expected a top-level "cards" array`);
  return parsed.cards;
}

function findArrayBlock(html, varName){
  const marker = `const ${varName} = [`;
  const startIdx = html.indexOf(marker);
  if(startIdx === -1) return null;
  let i = startIdx + marker.length - 1, depth = 0, arrayStart = i;
  for(; i < html.length; i++){
    if(html[i] === '[') depth++;
    else if(html[i] === ']'){ depth--; if(depth === 0){ i++; break; } }
  }
  return { arrayStart, arrayEnd: i, declStart: startIdx };
}

function replaceArrayBlock(html, varName, newArray){
  const block = findArrayBlock(html, varName);
  if(!block) throw new Error(`could not find "const ${varName} = [...]" in the target file`);
  const unchanged = html.slice(block.arrayStart, block.arrayEnd) === JSON.stringify(JSON.parse(html.slice(block.arrayStart, block.arrayEnd)));
  const newText = JSON.stringify(newArray);
  const before = html.slice(0, block.arrayStart);
  const after = html.slice(block.arrayEnd);
  const changed = html.slice(block.arrayStart, block.arrayEnd) !== newText;
  return { html: before + newText + after, changed };
}

// --- 1. load the 5 JSON decks (single source of truth) ---
const deckCards = {};
Object.entries(DECKS).forEach(([key, fileName]) => {
  deckCards[key] = loadDeckCards(fileName);
});

// --- 2. sync sodium-quest-mvp.html's runtime MISSIONS/FOOD/... arrays ---
{
  const gamePath = path.join(PROJECT_ROOT, 'sodium-quest-mvp.html');
  let html = fs.readFileSync(gamePath, 'utf8');
  let anyChanged = false;
  Object.entries(RUNTIME_VAR_NAMES).forEach(([deckKey, varName]) => {
    const result = replaceArrayBlock(html, varName, deckCards[deckKey]);
    html = result.html;
    if(result.changed){ anyChanged = true; console.log(`sodium-quest-mvp.html: ${varName} updated (${deckCards[deckKey].length} cards)`); }
  });
  if(anyChanged){
    fs.writeFileSync(gamePath, html, 'utf8');
    console.log('sodium-quest-mvp.html: written.');
  } else {
    console.log('sodium-quest-mvp.html: already in sync, no changes written.');
  }
}

// --- 3. sync cards.html's CARD_DECKS_DATA embed (used instead of fetch()) ---
{
  const cardsPath = path.join(PROJECT_ROOT, 'cards.html');
  let html = fs.readFileSync(cardsPath, 'utf8');
  const startMarker = '/* === AUTO-GENERATED: CARD_DECKS_DATA (do not edit by hand — run scripts/generate-cards-embed.js) === */';
  const endMarker = '/* === END AUTO-GENERATED === */';
  const newBlock = `${startMarker}\nconst CARD_DECKS_DATA = ${JSON.stringify(deckCards)};\n${endMarker}`;

  const startIdx = html.indexOf(startMarker);
  if(startIdx !== -1){
    const endIdx = html.indexOf(endMarker, startIdx);
    if(endIdx === -1) throw new Error('cards.html: found start marker but no matching end marker — file may be corrupted, aborting');
    const before = html.slice(0, startIdx);
    const after = html.slice(endIdx + endMarker.length);
    const oldBlock = html.slice(startIdx, endIdx + endMarker.length);
    if(oldBlock === newBlock){
      console.log('cards.html: CARD_DECKS_DATA already in sync, no changes written.');
    } else {
      html = before + newBlock + after;
      fs.writeFileSync(cardsPath, html, 'utf8');
      console.log('cards.html: CARD_DECKS_DATA updated and written.');
    }
  } else {
    // First run: insert right after `const DECKS = {...};`
    const decksMarker = 'const DECKS = {';
    const decksStart = html.indexOf(decksMarker);
    if(decksStart === -1) throw new Error('cards.html: could not find "const DECKS = {" to anchor the insertion');
    let i = decksStart + decksMarker.length - 1, depth = 0;
    for(; i < html.length; i++){
      if(html[i] === '{') depth++;
      else if(html[i] === '}'){ depth--; if(depth === 0){ i++; break; } }
    }
    // consume the trailing semicolon and newline after the DECKS object literal
    while(html[i] === ';') i++;
    while(html[i] === '\n' || html[i] === '\r') i++;
    const before = html.slice(0, i);
    const after = html.slice(i);
    html = before + newBlock + '\n' + after;
    fs.writeFileSync(cardsPath, html, 'utf8');
    console.log('cards.html: CARD_DECKS_DATA inserted for the first time and written.');
  }
}

console.log('\nDone.');
