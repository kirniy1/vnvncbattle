const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const WebSocket = require('ws');

const app = express();
app.use(bodyParser.json());

const BOT_TOKEN = '7253153475:AAFYHcH9qmD-0m-t8nl-f71GbRpzbTDwdys';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const db = new sqlite3.Database('./sqlite.db', (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS user_scores (
  chat_id INTEGER PRIMARY KEY,
  score INTEGER NOT NULL DEFAULT 0,
  tapping_guru_uses INTEGER NOT NULL DEFAULT 3,
  full_tank_uses INTEGER NOT NULL DEFAULT 3,
  last_boost_use_time TEXT
)`, (err) => {
  if (err) {
    console.error('Error creating table:', err.message);
  } else {
    console.log('user_scores table created or already exists');
  }
});

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
  const chatId = req.url.split('=')[1];
  console.log(`WebSocket connected for chat_id: ${chatId}`);
  
  getScore(chatId).then(score => {
    ws.send(JSON.stringify({ type: 'initScore', score: score }));
  });

  ws.on('message', (message) => {
    console.log('Received WebSocket message:', message.toString());
    const data = JSON.parse(message);
    if (data.type === 'updateScore') {
      updateScore(chatId, data.score);
    } else if (data.type === 'getScore') {
      getScore(chatId).then(score => {
        ws.send(JSON.stringify({ type: 'scoreUpdate', score: score }));
      });
    }
  });
});

function updateScore(chatId, newScore) {
  db.run('INSERT OR REPLACE INTO user_scores (chat_id, score) VALUES (?, ?)', [chatId, newScore], (err) => {
    if (err) {
      console.error('Error updating score:', err.message);
    } else {
      console.log(`Score updated for user ${chatId}: ${newScore}`);
      wss.clients.forEach(client => {
        if (client.url && client.url.split('=')[1] === chatId.toString()) {
          client.send(JSON.stringify({ type: 'scoreUpdate', score: newScore }));
        }
      });
    }
  });
}

app.post('/bot', async (req, res) => {
  const chatId = req.body.message.chat.id;
  const text = req.body.message.text;
  
  console.log(`Received command: ${text} from chat_id: ${chatId}`);

  try {
    if (text.startsWith('/score')) {
      const score = await getScore(chatId);
      await sendTelegramMessage(chatId, `Your current score is: ${score}`);
    } else if (text.startsWith('/setscore')) {
      const newScore = parseInt(text.split(' ')[1]);
      if (!isNaN(newScore)) {
        await updateScore(chatId, newScore);
        await sendTelegramMessage(chatId, `Your score has been updated to: ${newScore}`);
      } else {
        throw new Error('Invalid score');
      }
    } else if (text.startsWith('/getboosts')) {
      const boostData = await getBoostData(chatId);
      await sendTelegramMessage(chatId, `Boost data: ${JSON.stringify(boostData)}`);
    } else if (text.startsWith('/useboost')) {
      const boostType = text.split(' ')[1];
      const result = await useBoost(chatId, boostType);
      await sendTelegramMessage(chatId, result);
    } else {
      throw new Error('Unknown command');
    }
    res.send('OK');
  } catch (error) {
    console.error('Error processing request:', error.message);
    res.status(400).send(error.message);
  }
});

function getScore(chatId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT score FROM user_scores WHERE chat_id = ?', [chatId], (err, row) => {
      if (err) reject(err);
      resolve(row ? row.score : 0);
    });
  });
}

function getBoostData(chatId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT tapping_guru_uses, full_tank_uses, last_boost_use_time FROM user_scores WHERE chat_id = ?', [chatId], (err, row) => {
      if (err) reject(err);
      resolve(row || { tapping_guru_uses: 3, full_tank_uses: 3, last_boost_use_time: '{}' });
    });
  });
}

function useBoost(chatId, boostType) {
  return new Promise((resolve, reject) => {
    if (boostType !== 'tapping_guru' && boostType !== 'full_tank') {
      reject(new Error('Invalid boost type'));
      return;
    }

    db.get('SELECT tapping_guru_uses, full_tank_uses, last_boost_use_time FROM user_scores WHERE chat_id = ?', [chatId], (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      let boostData = row || { tapping_guru_uses: 3, full_tank_uses: 3, last_boost_use_time: '{}' };
      let lastBoostUseTime = JSON.parse(boostData.last_boost_use_time);
      
      if (boostData[`${boostType}_uses`] > 0 && (!lastBoostUseTime[boostType] || Date.now() - lastBoostUseTime[boostType] >= 24 * 60 * 60 * 1000)) {
        boostData[`${boostType}_uses`]--;
        lastBoostUseTime[boostType] = Date.now();
        
        db.run('UPDATE user_scores SET tapping_guru_uses = ?, full_tank_uses = ?, last_boost_use_time = ? WHERE chat_id = ?', 
          [boostData.tapping_guru_uses, boostData.full_tank_uses, JSON.stringify(lastBoostUseTime), chatId], 
          (updateErr) => {
            if (updateErr) {
              reject(updateErr);
              return;
            }
            resolve(`Boost ${boostType} used successfully. Remaining uses: ${boostData[`${boostType}_uses`]}`);
          }
        );
      } else {
        resolve(`Cannot use ${boostType} boost. Either no uses left or cooldown period not over.`);
      }
    });
  });
}

async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, { chat_id: chatId, text });
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
  }
}

app.get('/debug', (req, res) => {
  db.all('SELECT * FROM user_scores', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

const server = app.listen(3000, () => console.log('Bot is running on port 3000'));

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
