let conversationHistory = []; // full chat history for context
const MAX_MEMORY = 5;         // last N messages sent to API
let isLoading = false;
let recognition = null;
let isRecording = false;
let isDark = false;

// ── DOM refs ──
const messagesEl    = document.getElementById('messages');
const msgInput      = document.getElementById('msg-input');
const sendBtn       = document.getElementById('send-btn');
const clearBtn      = document.getElementById('clear-btn');
const clearBtnTop   = document.getElementById('clear-btn-top');
const themeToggle   = document.getElementById('theme-toggle');
const themeIcon     = document.getElementById('theme-icon');
const usernameInput = document.getElementById('username-input');
const greetingText  = document.getElementById('greeting-text');
const welcomeScreen = document.getElementById('welcome-screen');
const voiceBtn      = document.getElementById('voice-btn');
const quickReplies  = document.getElementById('quick-replies');

// ── Bot reply generation (Wikipedia + friendly canned replies) ──
async function getWikiSummary(query) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&list=search&utf8=1&srsearch=${encodeURIComponent(query)}&srlimit=1`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error('Wikipedia search failed');
    const searchData = await searchRes.json();
    const firstItem = searchData.query?.search?.[0];
    if (!firstItem) return null;

    const title = firstItem.title;
    const extractUrl = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&prop=extracts&exintro=1&explaintext=1&exsentences=4&redirects=1&titles=${encodeURIComponent(title)}`;
    const extractRes = await fetch(extractUrl);
    if (!extractRes.ok) throw new Error('Wikipedia extract failed');
    const extractData = await extractRes.json();
    const page = Object.values(extractData.query.pages)[0];
    if (!page || !page.extract) return null;

    return `${title}: ${page.extract.replace(/\n+/g, ' ').trim()}`;
  } catch (error) {
    console.error('Wikipedia fetch error:', error);
    return null;
  }
}

async function getBotReply(input) {
  const q = input.toLowerCase().trim();

  // ONLY answer "I'm Aura" for the exact question
  if (q === 'who are you?' || q === 'who are you') {
    return 'I\'m Aura, your AI companion. I can chat, answer questions, and help with various topics. What would you like to know?';
  }

  // Quick replies buttons - use flexible matching
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
  if (q.includes('time')) return `It\'s ${formatTime()} (your device time).`;

  // Try Wikipedia for any other question
  try {
    const wikiReply = await getWikiSummary(input);
    if (wikiReply) return wikiReply;
  } catch (err) {
    // network, CORS or API issues fall back to friendly response
    console.warn('Wikipedia lookup failed:', err);
  }

  return 'I couldn\'t find a direct wiki entry for that. Can you rephrase your question or ask about another topic?';
}

// ── Utility: format time ──
function formatTime() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Utility: auto-grow textarea ──
msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = msgInput.value.trim() === '' || isLoading;
});

// ── Enter to send ──
msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendMessage();
  }
});

// ── Theme toggle ──
themeToggle.addEventListener('click', () => {
  isDark = !isDark;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  themeIcon.innerHTML = isDark
    ? `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`
    : `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
});

// ── Username & greeting ──
usernameInput.addEventListener('input', () => {
  const name = usernameInput.value.trim();
  const greetings = [
    `Welcome back, ${name}! ✨`,
    `Great to see you, ${name}!`,
    `Ready to help, ${name}!`,
  ];
  greetingText.textContent = name
    ? greetings[Math.floor(Math.random() * greetings.length)]
    : '';
});

// ── Quick replies ──
quickReplies.addEventListener('click', (e) => {
  const btn = e.target.closest('.qr-btn');
  if (btn) {
    msgInput.value = btn.dataset.msg;
    msgInput.dispatchEvent(new Event('input'));
    sendMessage();
    // Focus chat on mobile
    if (window.innerWidth < 700) msgInput.focus();
  }
});

// ── Clear chat ──
function clearChat() {
  conversationHistory = [];
  // Remove all message rows (keep welcome screen)
  const rows = messagesEl.querySelectorAll('.msg-row');
  rows.forEach(r => r.remove());
  welcomeScreen.style.display = '';
  welcomeScreen.style.animation = 'fade-up .4s ease both';
}
clearBtn.addEventListener('click', clearChat);
clearBtnTop.addEventListener('click', clearChat);

// ── Append a message bubble ──
function appendMessage(role, text) {
  // Hide welcome screen
  welcomeScreen.style.display = 'none';

  const userName = usernameInput.value.trim() || 'You';
  const initials = userName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || 'U';

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'bot' ? '✦' : initials;

  const content = document.createElement('div');
  content.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  // Simple markdown-lite: code blocks, inline code, bold
  bubble.innerHTML = renderMarkdown(text);

  const time = document.createElement('div');
  time.className = 'msg-time';
  time.textContent = formatTime();

  content.appendChild(bubble);
  content.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(content);
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

// ── Typing indicator ──
function showTyping() {
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.id = 'typing-row';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '✦';

  const content = document.createElement('div');
  content.className = 'msg-content';

  const bubble = document.createElement('div');
  bubble.className = 'bubble typing-bubble';
  bubble.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;

  content.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(content);
  messagesEl.appendChild(row);
  scrollBottom();
}

function hideTyping() {
  const row = document.getElementById('typing-row');
  if (row) row.remove();
}

function scrollBottom() {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

// ── Simple markdown renderer ──
function renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Paragraphs (double newline → paragraph)
  html = html.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

  return html;
}

// ── Toast notification ──
function showToast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ── Main: send message ──
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || isLoading) return;

  // Clear input
  msgInput.value = '';
  msgInput.style.height = 'auto';
  sendBtn.disabled = true;
  isLoading = true;

  // Add user message to UI + history
  appendMessage('user', text);
  conversationHistory.push({ role: 'user', content: text });

  // Show typing indicator
  showTyping();

  // Build recent messages for API (last MAX_MEMORY exchanges)
  const recent = conversationHistory.slice(-MAX_MEMORY * 2);

  try {
    const reply = await getBotReply(text);

    hideTyping();
    appendMessage('bot', reply);
    conversationHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    hideTyping();
    showToast('⚠ ' + (err.message || 'Something went wrong. Please try again.'));
    // Remove user message from history on failure
    conversationHistory.pop();
  } finally {
    isLoading = false;
    sendBtn.disabled = msgInput.value.trim() === '';
    msgInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);

// ── Voice Input (Speech-to-Text) ──
function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.title = 'Voice input not supported in this browser';
    voiceBtn.style.opacity = '0.3';
    voiceBtn.style.cursor = 'not-allowed';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join('');
    msgInput.value = transcript;
    msgInput.dispatchEvent(new Event('input'));
  };

  recognition.onend = () => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
  };

  recognition.onerror = () => {
    isRecording = false;
    voiceBtn.classList.remove('recording');
  };

  voiceBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (isRecording) {
      recognition.stop();
    } else {
      recognition.start();
      isRecording = true;
      voiceBtn.classList.add('recording');
    }
  });
}

initVoice();

// ── Auto-focus input on load ──
msgInput.focus();