// アプリケーションの状態管理
let records = [];
let earningsChart = null;
let calendarDate = new Date();

// DOMの読み込み完了時
document.addEventListener('DOMContentLoaded', () => {
  // 初期設定と読み込み
  loadRecords();
  initEventListeners();
  updateUI();
  
  // Lucideアイコンの初期化
  lucide.createIcons();
});

// イベントリスナーの登録
function initEventListeners() {
  const addRecordBtn = document.getElementById('add-record-btn');
  const recordModal = document.getElementById('record-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const recordForm = document.getElementById('record-form');

  // 日付の初期値を今日に設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('input-date').value = today;

  // モーダル開閉
  addRecordBtn.addEventListener('click', () => {
    recordModal.classList.add('show');
  });

  const closeModal = () => {
    recordModal.classList.remove('show');
    // フォームの値をリセットせず前回の入力を保持（日付のみ今日のデフォルトに戻す）
    document.getElementById('input-date').value = today;
  };

  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // モーダル外クリックで閉じる
  window.addEventListener('click', (e) => {
    if (e.target === recordModal) {
      closeModal();
    }
  });

  // フォーム送信
  recordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const date = document.getElementById('input-date').value;
    const startTime = document.getElementById('input-start-time').value;
    const endTime = document.getElementById('input-end-time').value;
    const earnings = parseInt(document.getElementById('input-earnings').value, 10) || 0;
    const tips = parseInt(document.getElementById('input-tips').value, 10) || 0;

    // 勤務時間の計算（日跨ぎ対応）
    const hours = calculateHours(startTime, endTime);

    const newRecord = {
      id: Date.now().toString(),
      date,
      startTime,
      endTime,
      hours,
      earnings,
      tips
    };

    records.push(newRecord);
    // 日付順にソート
    records.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveRecords();
    updateUI();
    closeModal();
  });

  // カレンダーコントロール
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById('next-month-btn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  // ページ更新ボタン
  document.getElementById('refresh-btn').addEventListener('click', () => {
    window.location.reload();
  });
}

// 勤務時間の計算 (開始・終了時間から時間数を算出。深夜またぎに対応し、一律で3時間休憩を引く)
function calculateHours(start, end) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  
  // 終了時間が開始時間より前＝日をまたいでいるとみなす
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // 24時間分（1440分）を足す
  }

  // 勤務時間を算出
  const rawHours = diffMinutes / 60;
  
  // 3時間の休憩を引く（マイナスにならないよう下限を0にする）
  const finalHours = Math.max(0, rawHours - 3);

  // 小数点第2位まで計算して丸める
  return Math.round(finalHours * 100) / 100;
}

// LocalStorage から読み込み
function loadRecords() {
  const stored = localStorage.getItem('taxi_dashboard_records');
  if (stored) {
    try {
      records = JSON.parse(stored);
      // 日付順にソート
      records.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.error("データの読み込みに失敗しました:", e);
      records = [];
    }
  }
}

// LocalStorage へ保存
function saveRecords() {
  localStorage.setItem('taxi_dashboard_records', JSON.stringify(records));
}

// 履歴から削除
function deleteRecord(id) {
  if (confirm('この勤務記録を削除してもよろしいですか？')) {
    records = records.filter(record => record.id !== id);
    saveRecords();
    updateUI();
  }
}

// UIの全体更新
function updateUI() {
  updateMetrics();
  updateTable();
  updateChart();
  renderCalendar();
  
  // 動的に追加された要素のアイコンを再描画
  lucide.createIcons();
}

// 主要数値の計算と表示
function updateMetrics() {
  const totalDays = records.length;
  let totalHours = 0;
  let totalEarnings = 0;
  let totalTips = 0;

  records.forEach(r => {
    totalHours += r.hours;
    totalEarnings += r.earnings;
    totalTips += r.tips;
  });

  // 合算額での平均時給計算
  const totalCombined = totalEarnings + totalTips;
  const averageHourly = totalHours > 0 ? Math.round(totalCombined / totalHours) : 0;

  // 各要素への書き込み
  document.getElementById('val-days').innerHTML = `${totalDays} <span class="unit">日</span>`;
  document.getElementById('val-hours').innerHTML = `${totalHours.toFixed(1)} <span class="unit">時間</span>`;
  document.getElementById('val-earnings').innerText = `¥${totalEarnings.toLocaleString()}`;
  document.getElementById('val-tips').innerText = `¥${totalTips.toLocaleString()}`;
  document.getElementById('val-hourly').innerHTML = `¥${averageHourly.toLocaleString()}<span class="unit">/h</span>`;
  document.getElementById('record-count').innerText = `${totalDays} 件の記録`;
}

// テーブル履歴の描画
function updateTable() {
  const tbody = document.getElementById('history-tbody');
  
  if (records.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="7">
          <div class="empty-message">
            <i data-lucide="inbox"></i>
            <p>勤務記録がありません。「勤務を記録する」ボタンから登録してください。</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = '';
  
  // 最新の履歴が上に来るように逆順でループ
  [...records].reverse().forEach(r => {
    const tr = document.createElement('tr');
    
    const formattedDate = formatDate(r.date);
    const combinedTotal = r.earnings + r.tips;

    tr.innerHTML = `
      <td>${formattedDate}</td>
      <td>${r.startTime} 〜 ${r.endTime}</td>
      <td>${r.hours} 時間</td>
      <td>¥${r.earnings.toLocaleString()}</td>
      <td class="text-accent">¥${r.tips.toLocaleString()}</td>
      <td class="total-amount">¥${combinedTotal.toLocaleString()}</td>
      <td>
        <button class="btn-danger-icon" onclick="deleteRecord('${r.id}')" title="削除">
          <i data-lucide="trash-2"></i>
        </button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

// 日付フォーマットの変換 (YYYY-MM-DD -> MM/DD (曜日))
function formatDate(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = days[date.getDay()];
  return `${month}/${day} (${dayName})`;
}

// グラフ (Chart.js) の更新
function updateChart() {
  const ctx = document.getElementById('earningsChart').getContext('2d');
  
  // 過去最大10件の記録をグラフに表示
  const chartData = records.slice(-10);

  const labels = chartData.map(r => formatDate(r.date));
  const earningsData = chartData.map(r => r.earnings);
  const tipsData = chartData.map(r => r.tips);

  if (earningsChart) {
    earningsChart.destroy();
  }

  // グラフオプション (プレミアムダークテーマ用カスタマイズ)
  earningsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '売上金額',
          data: earningsData,
          backgroundColor: '#f5b041',
          borderColor: '#f5b041',
          borderRadius: 6,
          borderSkipped: false
        },
        {
          label: 'チップ額',
          data: tipsData,
          backgroundColor: '#00f2fe',
          borderColor: '#00f2fe',
          borderRadius: 6,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // カスタム凡例を使用するため非表示
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#161c2d',
          titleColor: '#fff',
          bodyColor: '#f3f4f6',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += '¥' + context.parsed.y.toLocaleString();
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit, Noto Sans JP'
            }
          }
        },
        y: {
          stacked: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.08)'
          },
          ticks: {
            color: '#9ca3af',
            font: {
              family: 'Outfit, Noto Sans JP'
            },
            callback: function(value) {
              return '¥' + value.toLocaleString();
            }
          }
        }
      }
    }
  });
}

// カレンダーの描画ロジック
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  // ラベル更新
  document.getElementById('current-month-label').innerText = `${year}年 ${month + 1}月`;

  const grid = document.getElementById('calendar-days-grid');
  grid.innerHTML = '';

  // その月の日数
  const totalDays = new Date(year, month + 1, 0).getDate();

  // 当月の1日から末日まで順番にセルを生成（前月・翌月ダミーは描画しない）
  const todayStr = new Date().toISOString().split('T')[0];
  for (let i = 1; i <= totalDays; i++) {
    const dateStr = formatDateStr(year, month, i);
    const isToday = dateStr === todayStr;
    
    // 曜日の取得 (0:日, 1:月, ... 6:土)
    const dayIndex = new Date(year, month, i).getDay();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayStr = weekdays[dayIndex];

    const dayEl = createDayCell(i, weekdayStr, dayIndex, dateStr, isToday);
    grid.appendChild(dayEl);
  }
}

// YYYY-MM-DD 形式の日付文字列を生成 (月跨ぎに対応)
function formatDateStr(year, month, day) {
  const d = new Date(year, month, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}

// カレンダーのセル要素を作成
function createDayCell(dayNum, weekdayStr, dayIndex, dateStr, isToday = false) {
  const dayEl = document.createElement('div');
  dayEl.className = 'calendar-day';
  if (isToday) dayEl.classList.add('today');

  // 日付と曜日の表示
  const numEl = document.createElement('span');
  numEl.className = 'day-number';
  if (dayIndex === 0) numEl.classList.add('sun');
  if (dayIndex === 6) numEl.classList.add('sat');
  numEl.innerText = `${dayNum} (${weekdayStr})`;
  dayEl.appendChild(numEl);

  // その日の勤務データを集計
  const dayRecords = records.filter(r => r.date === dateStr);
  if (dayRecords.length > 0) {
    dayEl.classList.add('has-work');

    let dayHours = 0;
    let dayEarnings = 0;
    let dayTips = 0;

    dayRecords.forEach(r => {
      dayHours += r.hours;
      dayEarnings += r.earnings;
      dayTips += r.tips;
    });

    const infoEl = document.createElement('div');
    infoEl.className = 'day-info';

    // 勤務時間
    const hoursEl = document.createElement('span');
    hoursEl.className = 'day-hours';
    hoursEl.innerText = `${dayHours.toFixed(1)}h`;
    infoEl.appendChild(hoursEl);

    // 売上
    const earningsEl = document.createElement('span');
    earningsEl.className = 'day-earnings';
    earningsEl.innerText = `¥${dayEarnings.toLocaleString()}`;
    infoEl.appendChild(earningsEl);

    // チップ
    const tipsEl = document.createElement('span');
    tipsEl.className = 'day-tips';
    tipsEl.innerText = `C${dayTips.toLocaleString()}`;
    infoEl.appendChild(tipsEl);

    dayEl.appendChild(infoEl);
  }

  return dayEl;
}
