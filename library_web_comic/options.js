// options.js — オプションページの簡易実装

const AUTO_BACKUP_KEY = 'mangaAutoBackup';
const SYNC_KEYS_KEY = 'mangaSyncKeys';
const HOSTS_MANUAL_KEY = 'mangaManualHosts';

const autoBackupEl = document.getElementById('autoBackup');
const syncKeysEl = document.getElementById('syncKeys');
const showLogsBtn = document.getElementById('showLogs');
const clearLogsBtn = document.getElementById('clearLogs');
const hostsListEl = document.getElementById('hostsList');
const addHostInput = document.getElementById('addHostInput');
const addHostBtn = document.getElementById('addHostBtn');
const saveBtn = document.getElementById('saveOptions');
const closeBtn = document.getElementById('closeOptions');

document.addEventListener('DOMContentLoaded', initOptions);

async function initOptions() {
  const res = await new Promise(resolve => chrome.storage.local.get([AUTO_BACKUP_KEY, SYNC_KEYS_KEY, HOSTS_MANUAL_KEY], r => resolve(r || {})));
  autoBackupEl.value = res[AUTO_BACKUP_KEY] || 'off';
  syncKeysEl.value = (res[SYNC_KEYS_KEY] || []).join(',');
  renderHosts(res[HOSTS_MANUAL_KEY] || []);
}

function renderHosts(list) {
  hostsListEl.innerHTML = '';
  if (!list || list.length === 0) {
    hostsListEl.textContent = '登録されたホストはありません';
    return;
  }
  list.forEach(h => {
    const item = document.createElement('div');
    item.className = 'hostItem';
    const left = document.createElement('div');
    left.textContent = h;
    const rem = document.createElement('button');
    rem.className = 'small secondary';
    rem.textContent = '削除';
    rem.addEventListener('click', async () => {
      const newList = (await getManualHosts()).filter(x => x !== h);
      await setManualHosts(newList);
      renderHosts(newList);
    });
    item.appendChild(left);
    item.appendChild(rem);
    hostsListEl.appendChild(item);
  });
}

function getManualHosts() {
  return new Promise(resolve => chrome.storage.local.get([HOSTS_MANUAL_KEY], res => resolve(res[HOSTS_MANUAL_KEY] || [])));
}
function setManualHosts(list) {
  return new Promise(resolve => chrome.storage.local.set({ [HOSTS_MANUAL_KEY]: list }, () => resolve()));
}

addHostBtn.addEventListener('click', async () => {
  const v = addHostInput.value.trim();
  if (!v) return alert('ホストパターンを入力してください');
  const list = await getManualHosts();
  if (!list.includes(v)) list.unshift(v);
  await setManualHosts(list);
  renderHosts(list);
  addHostInput.value = '';
});

saveBtn.addEventListener('click', async () => {
  const auto = autoBackupEl.value;
  const syncKeys = syncKeysEl.value.split(',').map(s => s.trim()).filter(Boolean);
  await new Promise(resolve => chrome.storage.local.set({ [AUTO_BACKUP_KEY]: auto, [SYNC_KEYS_KEY]: syncKeys }, () => resolve()));
  alert('設定を保存しました');
});

closeBtn.addEventListener('click', () => window.close());

showLogsBtn.addEventListener('click', async () => {
  const res = await new Promise(resolve => chrome.storage.local.get(['mangaErrorLogs'], r => resolve(r || {})));
  const logs = res.mangaErrorLogs || [];
  const text = logs.map(l => `${l.time}\n${JSON.stringify(l.entry)}\n`).join('\n---\n');
  if (!text) alert('ログはありません');
  else {
    // 簡易表示（大きい場合はコンソールへ）
    if (text.length < 20000) alert(text);
    else {
      console.log('mangaErrorLogs:', logs);
      alert('ログが大きいためコンソールに出力しました。開発者ツールを確認してください。');
    }
  }
});

clearLogsBtn.addEventListener('click', async () => {
  if (!confirm('エラーログを全て削除しますか？')) return;
  await new Promise(resolve => chrome.storage.local.remove(['mangaErrorLogs'], () => resolve()));
  alert('ログを削除しました');
});