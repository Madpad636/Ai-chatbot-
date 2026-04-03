const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { evaluate } = require('mathjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve frontend files
app.use(express.static(path.join(__dirname)));

// Serve chatbot.html on /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'chatbot.html'));
});

// Initialize SQLite database
const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
});

// Wikipedia helper
async function getWikiSummary(query) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&list=search&utf8=1&srsearch=${encodeURIComponent(query)}&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const firstItem = searchData.query?.search?.[0];
    if (!firstItem) return null;

    const title = firstItem.title;
    const extractUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro=1&explaintext=1&exsentences=4&redirects=1&titles=${encodeURIComponent(title)}`;
    const extractRes = await fetch(extractUrl);
    if (!extractRes.ok) return null;
    const extractData = await extractRes.json();
    const page = Object.values(extractData.query.pages)[0];
    if (!page || !page.extract) return null;

    return `${title}: ${page.extract.replace(/\n+/g, ' ').trim()}`;
  } catch (error) {
    console.error('Wikipedia fetch error:', error);
    return null;
  }
}

// Bot reply logic
async function generateBotReply(input) {
  const q = input.toLowerCase().trim();

  // Answer "who are you"
  if (q === 'who are you?' || q === 'who are you') {
    return 'I\'m Aura, your AI companion. I can chat, answer questions, and help with various topics. What would you like to know?';
  }

  // Math Evaluation Module
  try {
    // Extract potential math expressions (e.g. "what is 5+5", "calculate 10/2", or just "5*5")
    let mathExpr = q.replace(/what is\s*/i, '').replace(/calculate\s*/i, '').replace(/\?$/, '').trim();
    // Allow basic math characters only to avoid evaluating 'hello' and causing errors
    if (/^[0-9+\-*/().^\s]+$/.test(mathExpr) && mathExpr.length > 0) {
      const result = evaluate(mathExpr);
      return `${mathExpr} = ${result}`;
    }
  } catch (err) {
    // If mathjs evaluation fails, just ignore and fall back to conversational replies
  }

  // Quick replies buttons
  if (q.includes('tell me something') && q.includes('fascinating')) {
    return 'Fascinating fact: Octopuses have three hearts and blue blood, and they can unscrew jar lids to escape— intelligence evolved independently from vertebrates!';
  }
  if (q.includes('how can i be more productive')) {
    return 'Try the Pomodoro method (25 min work + 5 min break), remove distractions, and prioritize 3 tasks. Small batching and short breaks are powerful ways to maintain focus.';
  }
  if (q.includes('explain') && q.includes('machine learning')) {
    return 'Machine learning is about teaching computers to find patterns in data and improve from experience, like training a model to recognize images by showing many examples.';
  }

  // Other patterns
  if (q.includes('hello') || q.includes('hi')) return 'Hello! How can I help you today?';
  if (q.includes('what is artificial intelligence') || q.includes('what is ai') || q === 'what is ai?' || q === 'what is artificial intelligence?') {
    return 'AI is artificial intelligence — machines that can think, learn, and solve problems like humans. It includes smart systems that analyze data, make predictions, and automate tasks.';
  }
  if (q.includes('help me write clean python code') || q.includes('help me code')) {
    return 'Sure! Start with clear variable names, small functions, and comments. Example:\n```python\n# greet user\ndef greet(name):\n    print(f"Hello, {name}!")\n\nif __name__ == "__main__":\n    greet("World")\n```\nUse linters like pylint and format with black for consistent style.';
  }
  if (q.includes('how are you')) return 'I\'m doing great, thanks! Ready to chat.';
  if (q.includes('bye') || q.includes('goodbye')) return 'Goodbye! Have a wonderful day.';
  if (q.includes('thank')) return 'You\'re welcome!';
  if (q.includes('joke')) return 'Why did the computer go to therapy? It had too many bytes of emotional baggage!';
  if (q.includes('weather')) return 'I don\'t have real-time data, but I hope it\'s nice where you are!';

  // Try Wikipedia for any other question
  const wikiReply = await getWikiSummary(input);
  if (wikiReply) return wikiReply;

  return 'I couldn\'t find a direct wiki entry for that. Can you rephrase your question or ask about another topic?';
}

// API Routes

// GET all messages (chat history)
app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY timestamp ASC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// POST new message and generate bot reply
app.post('/api/chat', async (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  // 1. Save user message
  db.run('INSERT INTO messages (role, content) VALUES (?, ?)', ['user', content], async function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // 2. Generate bot reply
    try {
      const botReply = await generateBotReply(content);

      // 3. Save bot reply
      db.run('INSERT INTO messages (role, content) VALUES (?, ?)', ['assistant', botReply], function(err2) {
        if (err2) {
          return res.status(500).json({ error: err2.message });
        }
        
        // Return both the newly created bot reply and its source
        res.json({ role: 'assistant', content: botReply });
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate bot reply' });
    }
  });
});

// Clear history
app.delete('/api/messages', (req, res) => {
  db.run('DELETE FROM messages', [], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'History cleared' });
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
