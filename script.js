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

// ── Bot API Integration ──
// Fetch messages from backend on load
async function loadChatHistory() {
  try {
    const res = await fetch('/api/messages');
    if (!res.ok) return;
    const messages = await res.json();
    if (messages.length > 0) {
      welcomeScreen.style.display = 'none';
      messages.forEach(msg => {
        // use basic append logic but skip animations if desired, or just use existing appendMessage
        const roleStr = msg.role === 'assistant' ? 'bot' : 'user';
        // avoid re-saving in history array or just push
        conversationHistory.push({ role: msg.role, content: msg.content });
        appendMessageUI(roleStr, msg.content, new Date(msg.timestamp));
      });
    }
  } catch (err) {
    console.error('Failed to load history', err);
  }
}

// Wrapper for UI append without touching conversationHistory to avoid duplicate logic
function appendMessageUI(role, text, dateObj = null) {
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
  bubble.innerHTML = renderMarkdown(text);

  const time = document.createElement('div');
  time.className = 'msg-time';
  
  const d = dateObj || new Date();
  time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  content.appendChild(bubble);
  content.appendChild(time);
  row.appendChild(avatar);
  row.appendChild(content);
  messagesEl.appendChild(row);
  scrollBottom();
  return row;
}

// Hook up the getBotReply to the backend
async function getBotReply(input) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input })
  });
  if (!response.ok) throw new Error('API error');
  const data = await response.json();
  return data.content;
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
async function clearChat() {
  try {
    await fetch('/api/messages', { method: 'DELETE' });
  } catch (e) {
    console.error('Failed to clear on server', e);
  }
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
  return appendMessageUI(role, text);
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
loadChatHistory();