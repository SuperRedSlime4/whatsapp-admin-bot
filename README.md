# 🤖 WhatsApp Admin Bot

Bot per il gruppo amministratori del canale WhatsApp.  
Gestisce **ruoli settimanali**, **eventi**, **richiami**, **ban** e **avvisi**.

---

## ✨ Funzionalità

### Comandi per tutti
| Comando | Descrizione |
|---------|-------------|
| `/ruolo` | Mostra i ruoli di tutti gli admin della settimana |
| `/ruolo @Nome` | Mostra il ruolo di una persona specifica |
| `/help` | Lista dei comandi |

### Comandi solo per te (il proprietario)
| Comando | Descrizione |
|---------|-------------|
| `/evento create Nome Info...` | Crea un evento |
| `/evento remove Nome` | Elimina un evento |
| `/evento list` | Mostra tutti gli eventi |
| `/richiamo @Nome Motivo` | Assegna un richiamo (10 = ban possibile) |
| `/ban @Nome` | Rimuove una persona dal gruppo |
| `/avviso Titolo Testo...` | Invia un avviso a tutti (con menzioni) |

### Automatico
- **Ogni lunedì alle 09:00** (ora italiana) il bot invia automaticamente i nuovi ruoli nel gruppo.

---

## 📋 Amministratori e Ruoli

**Amministratori (ordine di rotazione):**
1. Alexa
2. Leonardo
3. Daniel
4. TobiaDV
5. Elisabetta

**Ruoli:**
1. Sondaggi
2. Quiz
3. Post
4. Notizie
5. Vacanza

La rotazione è automatica e ciclica. Nessuno avrà mai due settimane di Vacanza consecutive.

---

## 🚀 Guida completa per principianti (GitHub + Render)

### Passo 1 – Crea il repository su GitHub

1. Vai su [https://github.com](https://github.com) e accedi
2. Clicca sul **+** in alto a destra → **New repository**
3. Nome: `whatsapp-admin-bot` (o quello che preferisci)
4. Lascia **Public**
5. **NON** spuntare "Add a README"
6. Clicca **Create repository**

### Passo 2 – Carica i file

Hai due modi:

#### Metodo A (più semplice – da browser)
1. Nella pagina del repository appena creato, clicca **uploading an existing file**
2. Trascina **tutti** i file di questa cartella:
   - `index.js`
   - `package.json`
   - `README.md`
   - `.gitignore`
3. Scrivi un messaggio tipo "Primo commit" e clicca **Commit changes**

#### Metodo B (con Git – se lo conosci)
```bash
git init
git add .
git commit -m "Primo commit"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/whatsapp-admin-bot.git
git push -u origin main
```

### Passo 3 – Crea il servizio su Render

1. Vai su [https://render.com](https://render.com) e registrati (puoi usare l’account GitHub)
2. Clicca **New +** → **Background Worker** (importante! Non scegliere Web Service)
3. Collega il repository `whatsapp-admin-bot`
4. Impostazioni importanti:

| Campo | Valore |
|-------|--------|
| **Name** | whatsapp-admin-bot |
| **Region** | Frankfurt (o la più vicina) |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `node index.js` |
| **Instance Type** | Free |

5. Clicca **Create Background Worker**

> **Perché Background Worker?**  
> Il bot deve restare sempre acceso per ricevere i messaggi e mandare l’annuncio del lunedì alle 09:00.  
> Il Web Service sul piano free si addormenta dopo un po’ di inattività.

### Passo 4 – Collega WhatsApp (QR Code)

1. Dopo il deploy, vai sulla pagina del servizio su Render
2. Clicca sulla tab **Logs**
3. Vedrai apparire un **QR Code** nel terminale
4. Apri WhatsApp sul telefono → **Impostazioni** → **Dispositivi collegati** → **Collega un dispositivo**
5. Scansiona il QR Code

Quando vedi il messaggio `✅ Bot connesso e online!` sei a posto.

### Passo 5 – Imposta il Group ID (consigliato)

1. Scrivi un qualsiasi messaggio nel gruppo degli amministratori
2. Nei **Logs** di Render vedrai una riga tipo:
   ```
   📌 GROUP_ID rilevato automaticamente: 120363xxxxxx@g.us
   ```
3. Copia quel codice
4. Su Render → il tuo servizio → **Environment** → **Add Environment Variable**
   - Key: `GROUP_ID`
   - Value: `120363xxxxxx@g.us`
5. Salva. Al prossimo riavvio userà solo quel gruppo.

---

## ⚠️ Note importanti

- **Sessione**: la cartella `auth_info` contiene la sessione WhatsApp. Su Render free il filesystem è temporaneo: se il servizio si spegne a lungo potrebbe servire un nuovo QR. È normale sul piano gratuito.
- **Bot deve essere admin**: per usare `/ban` il bot deve essere amministratore del gruppo.
- **Dati**: eventi e richiami sono salvati in `data.json`. Su piano free possono perdersi ai riavvii lunghi. Per uso serio si può aggiungere un database in futuro.

---

## 🛠️ Comandi utili in locale (se vuoi testare sul PC)

```bash
npm install
node index.js
```

Poi scansiona il QR che appare nel terminale.

---

Buon lavoro! 🚀
Se hai problemi, controlla sempre i **Logs** su Render.
