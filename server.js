require('dotenv').config();
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let database;

client.connect(err => {
  if (err) {
    console.error('Failed to connect to MongoDB', err);
    return;
  }
  database = client.db('vnvnc_coin_tapper');
  console.log('Connected to MongoDB');
});

app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const user = await database.collection('users').findOne({ telegramId: req.params.telegramId });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.post('/api/user/:telegramId', async (req, res) => {
  try {
    const result = await database.collection('users').updateOne(
      { telegramId: req.params.telegramId },
      { $set: req.body },
      { upsert: true }
    );
    res.json({ message: 'User data updated', result });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
