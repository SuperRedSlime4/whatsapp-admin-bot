/**
 * WhatsApp Admin Bot
 * Bot per gestire ruoli settimanali, eventi, richiami e avvisi
 * in un gruppo di amministratori di un canale WhatsApp.
 *
 * Tecnologie: Baileys + node-cron
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// ====================== CONFIGURAZIONE ======================

const OWNER_NUMBER = '393780926670'; // Tu (unico autorizzato ai comandi potenti)

const ADMINS = [
  { name: 'Alexa',      number: '393347914059' },
  { name: 'Leonardo',  number: '393759833130' },
  { name: 'Daniel',    number: '393516823379' },
  { name: 'TobiaDV',   number: '393519252351' },
  { name: 'Elisabetta', number: '393457444501' }
];

const ROLES = [
  'Sondaggi',
  'Quiz',
  'Post',
  'Notizie',
  'Vacanza'
];

// Il Group ID verrà impostato automaticamente la prima volta che qualcuno scrive nel gruppo
// oppure puoi metterlo a mano qui dopo averlo visto nei log
let GROUP_ID = process.env.GROUP_ID || null;

const DATA_FILE = path.join(__dirname, 'data.json');
const AUTH_FOLDER = path.join(__dirname, 'auth_info');

// ====================== PERSISTENZA DATI ======================

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Errore caricamento data.json:', e.message);
  }
  return {
    warns: {},      // { "3933...": [ {reason, date, by} ] }
    events: {},     // { "nomeevento": { info, createdAt, createdBy } }
    lastAnnounceWeek: null
  };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Errore salvataggio data.json:', e.message);
  }
}

let data = loadData();

// ====================== LOGICA RUOLI ======================

/**
 * Calcola il numero della settimana ISO (1-53)
 */
function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Restituisce l'assegnazione ruoli per la settimana corrente
 * Rotazione ciclica: offset = week % 5
 * Nessuno avrà mai due Vacanza consecutive
 */
function getCurrentRoles() {
  const week = getISOWeek();
  const offset = week % ADMINS.length;

  const assignment = ADMINS.map((admin, index) => {
    const roleIndex = (index + offset) % ROLES.length;
    return {
      ...admin,
      role: ROLES[roleIndex]
    };
  });

  return { week, assignment };
}

function findAdminByMention(text, mentions = []) {
  // Prima prova con le menzioni reali (JID)
  if (mentions && mentions.length > 0) {
    for (const jid of mentions) {
      const num = jid.replace('@s.whatsapp.net', '').replace('@lid', '');
      const admin = ADMINS.find(a => a.number === num);
      if (admin) return admin;
    }
  }

  // Fallback: cerca il nome nel testo (es. @Alexa o Alexa)
  const lower = text.toLowerCase();
  for (const admin of ADMINS) {
    if (lower.includes('@' + admin.name.toLowerCase()) || lower.includes(admin.name.toLowerCase())) {
      return admin;
    }
  }
  return null;
}

function isOwner(jid) {
  const num = jidNormalizedUser(jid).replace('@s.whatsapp.net', '');
  return num === OWNER_NUMBER;
}

function isAdminNumber(num) {
  return ADMINS.some(a => a.number === num);
}

// ====================== MESSAGGI FORMATATI ======================

function formatAllRoles() {
  const { week, assignment } = getCurrentRoles();

  let msg = `╭─────────────────────╮\n`;
  msg += `│  📅 *RUOLI SETTIMANA ${week}*  │\n`;
  msg += `╰─────────────────────╯\n\n`;

  for (const a of assignment) {
    const emoji = a.role === 'Vacanza' ? '🏖️' : '📌';
    msg += `${emoji} *${a.name}* → _${a.role}_\n`;
  }

  msg += `\n─────────────────────\n`;
  msg += `_I ruoli cambiano ogni lunedì_`;

  return msg;
}

function formatSingleRole(admin) {
  const { assignment } = getCurrentRoles();
  const found = assignment.find(a => a.number === admin.number);

  if (!found) return '❌ Amministratore non trovato.';

  const emoji = found.role === 'Vacanza' ? '🏖️' : '📌';

  return `${emoji} *${found.name}* si occuperà di *${found.role}* per questa settimana.`;
}

function formatEvents() {
  const keys = Object.keys(data.events);
  if (keys.length === 0) {
    return '📭 Nessun evento attivo al momento.';
  }

  let msg = `╭─────────────────────╮\n`;
  msg += `│  📋 *EVENTI ATTIVI*  │\n`;
  msg += `╰─────────────────────╯\n\n`;

  for (const name of keys) {
    const ev = data.events[name];
    msg += `🎯 *${name}*\n`;
    msg += `   ${ev.info}\n`;
    msg += `   _Creato il ${ev.createdAt}_\n\n`;
  }

  return msg.trim();
}

// ====================== SOCKET E CONNESSIONE ======================

let sock = null;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 SCANSIONA QUESTO QR CODE CON WHATSAPP:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nApri WhatsApp → Dispositivi collegati → Collega un dispositivo\n');
    }

    if (connection === 'open') {
      console.log('✅ Bot connesso e online!');
      if (GROUP_ID) {
        console.log(`📌 Gruppo impostato: ${GROUP_ID}`);
      } else {
        console.log('⚠️  GROUP_ID non impostato. Scrivi un messaggio nel gruppo e lo vedrò nei log.');
      }
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      console.log(`🔌 Connessione chiusa (codice: ${code}). Riconnetto: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Sessione disconnessa definitivamente. Elimina la cartella auth_info e riavvia per un nuovo QR.');
      }
    }
  });

  // ====================== GESTIONE MESSAGGI ======================

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;

        const remoteJid = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');

        // Solo gruppi
        if (!isGroup) continue;

        // Se non abbiamo ancora il GROUP_ID, lo prendiamo dal primo messaggio di gruppo
        if (!GROUP_ID) {
          GROUP_ID = remoteJid;
          console.log(`📌 GROUP_ID rilevato automaticamente: ${GROUP_ID}`);
          console.log('   (Puoi salvarlo come variabile d\'ambiente GROUP_ID su Render)');
        }

        // Solo il gruppo autorizzato
        if (remoteJid !== GROUP_ID) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        if (!text.startsWith('/')) continue;

        const senderNum = jidNormalizedUser(sender).replace('@s.whatsapp.net', '');
        const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];

        console.log(`[CMD] ${senderNum}: ${text}`);

        // ---------- /ruolo ----------
        if (text.toLowerCase().startsWith('/ruolo')) {
          const mentionedAdmin = findAdminByMention(text, mentions);

          if (mentionedAdmin) {
            await reply(remoteJid, formatSingleRole(mentionedAdmin), msg);
          } else {
            await reply(remoteJid, formatAllRoles(), msg);
          }
          continue;
        }

        // ---------- COMANDI SOLO OWNER ----------
        if (!isOwner(sender)) {
          // Se qualcuno prova un comando protetto
          if (
            text.toLowerCase().startsWith('/evento') ||
            text.toLowerCase().startsWith('/richiamo') ||
            text.toLowerCase().startsWith('/ban') ||
            text.toLowerCase().startsWith('/avviso')
          ) {
            await reply(remoteJid, '⛔ Solo l\'amministratore principale può usare questo comando.', msg);
          }
          continue;
        }

        // ---------- /evento ----------
        if (text.toLowerCase().startsWith('/evento')) {
          await handleEvento(text, remoteJid, msg, senderNum);
          continue;
        }

        // ---------- /richiamo ----------
        if (text.toLowerCase().startsWith('/richiamo')) {
          await handleRichiamo(text, mentions, remoteJid, msg, senderNum);
          continue;
        }

        // ---------- /ban ----------
        if (text.toLowerCase().startsWith('/ban')) {
          await handleBan(text, mentions, remoteJid, msg);
          continue;
        }

        // ---------- /avviso ----------
        if (text.toLowerCase().startsWith('/avviso')) {
          await handleAvviso(text, remoteJid, msg);
          continue;
        }

        // ---------- /help ----------
        if (text.toLowerCase().startsWith('/help') || text.toLowerCase() === '/comandi') {
          await reply(remoteJid, getHelpText(isOwner(sender)), msg);
          continue;
        }

      } catch (err) {
        console.error('Errore gestione messaggio:', err);
      }
    }
  });
}

// ====================== HANDLER COMANDI ======================

async function handleEvento(text, remoteJid, msg, senderNum) {
  const parts = text.trim().split(/\s+/);
  // /evento create NomeEvento Info lunga...
  // /evento remove NomeEvento
  // /evento list   (opzionale)

  if (parts.length < 2) {
    await reply(remoteJid, formatEvents() + '\n\n_Usa:_\n`/evento create Nome Info...`\n`/evento remove Nome`', msg);
    return;
  }

  const sub = parts[1].toLowerCase();

  if (sub === 'create' || sub === 'crea') {
    if (parts.length < 4) {
      await reply(remoteJid, '❌ Uso corretto:\n`/evento create NomeEvento Descrizione completa...`', msg);
      return;
    }
    const nome = parts[2];
    const info = parts.slice(3).join(' ');

    data.events[nome] = {
      info,
      createdAt: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
      createdBy: senderNum
    };
    saveData(data);

    await reply(remoteJid,
      `✅ *Evento creato!*\n\n🎯 *${nome}*\n${info}`,
      msg
    );
  }
  else if (sub === 'remove' || sub === 'elimina' || sub === 'delete') {
    if (parts.length < 3) {
      await reply(remoteJid, '❌ Uso corretto:\n`/evento remove NomeEvento`', msg);
      return;
    }
    const nome = parts[2];
    if (!data.events[nome]) {
      await reply(remoteJid, `❌ Evento *${nome}* non trovato.`, msg);
      return;
    }
    delete data.events[nome];
    saveData(data);
    await reply(remoteJid, `🗑️ Evento *${nome}* eliminato.`, msg);
  }
  else if (sub === 'list' || sub === 'lista') {
    await reply(remoteJid, formatEvents(), msg);
  }
  else {
    await reply(remoteJid, '❌ Sottocomandi disponibili:\n`create` · `remove` · `list`', msg);
  }
}

async function handleRichiamo(text, mentions, remoteJid, msg, byNum) {
  const admin = findAdminByMention(text, mentions);
  if (!admin) {
    await reply(remoteJid, '❌ Devi menzionare un amministratore.\nEsempio: `/richiamo @Alexa Motivo del richiamo`', msg);
    return;
  }

  // Motivo = tutto dopo il nome
  let motivo = text
    .replace(/\/richiamo/i, '')
    .replace(new RegExp('@?' + admin.name, 'i'), '')
    .trim();

  if (!motivo) motivo = 'Nessun motivo specificato';

  if (!data.warns[admin.number]) data.warns[admin.number] = [];

  data.warns[admin.number].push({
    reason: motivo,
    date: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }),
    by: byNum
  });
  saveData(data);

  const count = data.warns[admin.number].length;

  let risposta = `⚠️ *RICHIAMO*\n\n`;
  risposta += `👤 *${admin.name}*\n`;
  risposta += `📝 Motivo: _${motivo}_\n`;
  risposta += `🔢 Richiami totali: *${count}/10*\n`;

  if (count >= 10) {
    risposta += `\n🚨 *ATTENZIONE:* ha raggiunto 10 richiami!\nPuoi usare \`/ban @${admin.name}\` per rimuoverlo.`;
  } else if (count >= 7) {
    risposta += `\n⚡ Attenzione: si sta avvicinando al limite.`;
  }

  await reply(remoteJid, risposta, msg);
}

async function handleBan(text, mentions, remoteJid, msg) {
  const admin = findAdminByMention(text, mentions);
  if (!admin) {
    await reply(remoteJid, '❌ Devi menzionare un amministratore.\nEsempio: `/ban @Alexa`', msg);
    return;
  }

  const count = (data.warns[admin.number] || []).length;

  // Rimuove dal gruppo (se il bot è admin)
  try {
    await sock.groupParticipantsUpdate(remoteJid, [`${admin.number}@s.whatsapp.net`], 'remove');
    await reply(remoteJid,
      `🚫 *${admin.name}* è stato rimosso dal gruppo.\n` +
      `Richiami accumulati: *${count}*`,
      msg
    );
  } catch (e) {
    await reply(remoteJid,
      `❌ Non sono riuscito a rimuovere *${admin.name}*.\n` +
      `Assicurati che il bot sia *amministratore* del gruppo.\n\n` +
      `_Errore: ${e.message}_`,
      msg
    );
  }
}

async function handleAvviso(text, remoteJid, msg) {
  // /avviso TITOLO Testo lungo...
  const cleaned = text.replace(/\/avviso/i, '').trim();
  if (!cleaned) {
    await reply(remoteJid, '❌ Uso corretto:\n`/avviso TITOLO Testo dell\'avviso...`\n\nEsempio:\n`/avviso MODIFICA NOME Da oggi cambiamo il formato dei post`', msg);
    return;
  }

  // Primo pezzo = titolo, resto = corpo
  const parts = cleaned.split(/\s+/);
  const titolo = parts[0];
  const corpo = parts.slice(1).join(' ') || 'Nessun dettaglio.';

  // Menziona tutti gli admin
  const mentions = ADMINS.map(a => `${a.number}@s.whatsapp.net`);

  let messaggio = `╭─────────────────────╮\n`;
  messaggio += `│  📢 *AVVISO IMPORTANTE*  │\n`;
  messaggio += `╰─────────────────────╯\n\n`;
  messaggio += `🔔 *${titolo.toUpperCase()}*\n\n`;
  messaggio += `${corpo}\n\n`;
  messaggio += `─────────────────────\n`;
  messaggio += ADMINS.map(a => `@${a.name}`).join(' ');

  await sock.sendMessage(remoteJid, {
    text: messaggio,
    mentions
  }, { quoted: msg });
}

function getHelpText(isOwnerUser) {
  let msg = `╭─────────────────────╮\n`;
  msg += `│  📖 *COMANDI DISPONIBILI*  │\n`;
  msg += `╰─────────────────────╯\n\n`;

  msg += `*Per tutti:*\n`;
  msg += `• \`/ruolo\` → Mostra tutti i ruoli\n`;
  msg += `• \`/ruolo @Nome\` → Ruolo di una persona\n`;
  msg += `• \`/help\` → Questo messaggio\n\n`;

  if (isOwnerUser) {
    msg += `*Solo per te:*\n`;
    msg += `• \`/evento create Nome Info\`\n`;
    msg += `• \`/evento remove Nome\`\n`;
    msg += `• \`/evento list\`\n`;
    msg += `• \`/richiamo @Nome Motivo\`\n`;
    msg += `• \`/ban @Nome\`\n`;
    msg += `• \`/avviso Titolo Testo\`\n`;
  }

  return msg;
}

// ====================== UTILITY ======================

async function reply(jid, text, quotedMsg) {
  try {
    await sock.sendMessage(jid, { text }, { quoted: quotedMsg });
  } catch (e) {
    console.error('Errore invio messaggio:', e.message);
  }
}

// ====================== CRON - ANNUNCIO LUNEDÌ 09:00 ======================

function startCron() {
  // Ogni lunedì alle 09:00 ora italiana
  cron.schedule('0 9 * * 1', async () => {
    if (!sock || !GROUP_ID) {
      console.log('Cron: bot non pronto o GROUP_ID mancante');
      return;
    }

    const { week } = getCurrentRoles();

    // Evita di inviare due volte la stessa settimana (in caso di restart)
    if (data.lastAnnounceWeek === week) {
      console.log(`Cron: annuncio settimana ${week} già inviato`);
      return;
    }

    try {
      const text = formatAllRoles();
      const mentions = ADMINS.map(a => `${a.number}@s.whatsapp.net`);

      await sock.sendMessage(GROUP_ID, {
        text: `🌅 *Buon inizio settimana!*\n\n` + text,
        mentions
      });

      data.lastAnnounceWeek = week;
      saveData(data);
      console.log(`✅ Annuncio ruoli settimana ${week} inviato`);
    } catch (e) {
      console.error('Errore cron annuncio:', e.message);
    }
  }, {
    timezone: 'Europe/Rome'
  });

  console.log('⏰ Cron job attivato: ogni lunedì alle 09:00 (Europe/Rome)');
}

// ====================== AVVIO ======================

console.log('🚀 Avvio WhatsApp Admin Bot...');
startBot().then(() => {
  startCron();
}).catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
