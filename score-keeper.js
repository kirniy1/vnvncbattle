const serverUrl = 'http://vnvnc-coin-tapper-server-1.kirniy.repl.co';

async function getTelegramId() {
  try {
    const tg = window.Telegram.WebApp;
    return tg.initDataUnsafe.user.id;
  } catch (error) {
    showError(`Failed to get Telegram ID: ${error.message}`);
    return null;
  }
}

async function saveScore(score) {
  try {
    const telegramId = await getTelegramId();
    if (telegramId) {
      await axios.post(`${serverUrl}/api/user/${telegramId}`, { score });
      console.log('Score saved successfully');
    }
  } catch (error) {
    showError(`Failed to save score: ${error.message}`);
  }
}

async function loadScore() {
  try {
    const telegramId = await getTelegramId();
    if (telegramId) {
      const response = await axios.get(`${serverUrl}/api/user/${telegramId}`);
      return response.data.score || 0;
    }
    return 0;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('User not found, creating a new user');
    } else {
      showError(`Failed to load score: ${error.message}`);
    }
    return 0;
  }
}

function showError(message) {
  console.error(message);
  const errorMessage = document.getElementById('error-message');
  if (errorMessage) {
    errorMessage.textContent = message;
    setTimeout(() => {
      errorMessage.textContent = '';
    }, 3000);
  }
}
