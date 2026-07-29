// Modular UI Controller for Shadow Hunt

export class UIController {
  constructor(audioEngine) {
    this.audioEngine = audioEngine;
    this.currentScreen = 'screen-lobby';
    this.myPlayerId = null;
    this.roomState = null;

    this.bindDOM();
  }

  bindDOM() {
    this.screens = {
      lobby: document.getElementById('screen-lobby'),
      game: document.getElementById('screen-game'),
      results: document.getElementById('screen-results')
    };

    // Tabs
    this.tabCreate = document.getElementById('tab-create');
    this.tabJoin = document.getElementById('tab-join');
    this.formCreate = document.getElementById('form-create');
    this.formJoin = document.getElementById('form-join');

    // Forms & Inputs
    this.inputPlayerName = document.getElementById('player-name-input');
    this.inputRoomCode = document.getElementById('room-code-input');
    this.selectRoundTime = document.getElementById('setting-round-time');
    this.selectMaxPlayers = document.getElementById('setting-max-players');
    this.checkBotFill = document.getElementById('setting-bot-fill');

    // Buttons
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.btnLeaveRoom = document.getElementById('btn-leave-room');
    this.btnToggleReady = document.getElementById('btn-toggle-ready');
    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.btnResultsLobby = document.getElementById('btn-results-lobby');
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');
    this.btnLeaderboard = document.getElementById('btn-leaderboard');
    this.btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');

    // Waiting Area
    this.roomWaitingPanel = document.getElementById('room-waiting-panel');
    this.displayRoomCode = document.getElementById('display-room-code');
    this.playerListContainer = document.getElementById('player-list-container');
    this.playerCountSpan = document.getElementById('player-count');
    this.playerMaxSpan = document.getElementById('player-max');
    this.readyBtnText = document.getElementById('ready-btn-text');

    // HUD Elements
    this.hudRoleCard = document.getElementById('hud-role-card');
    this.hudRoleText = document.getElementById('hud-role-text');
    this.hudRoleIcon = document.getElementById('hud-role-icon');
    this.hudTimerBadge = document.getElementById('hud-timer-badge');
    this.hudTimerText = document.getElementById('hud-timer-text');
    this.hudSurvivorsCount = document.getElementById('hud-survivors-count');
    this.hudKillsCount = document.getElementById('hud-kills-count');
    this.spectatorBanner = document.getElementById('spectator-banner');
    this.powerupToast = document.getElementById('powerup-notify');
    this.powerupToastText = document.getElementById('powerup-toast-text');

    // Ping & Modals
    this.pingContainer = document.getElementById('ping-container');
    this.pingText = document.getElementById('ping-text');
    this.modalLeaderboard = document.getElementById('modal-leaderboard');
    this.leaderboardBody = document.getElementById('leaderboard-body');
    this.scoreboardBody = document.getElementById('scoreboard-body');

    const savedName = localStorage.getItem('sh_player_name');
    if (savedName) this.inputPlayerName.value = savedName;

    this.btnSoundToggle.addEventListener('click', () => {
      const muted = this.audioEngine.toggleMute();
      document.getElementById('sound-icon').textContent = muted ? '🔇' : '🔊';
    });

    this.btnLeaderboard.addEventListener('click', () => this.showLeaderboard());
    this.btnCloseLeaderboard.addEventListener('click', () => this.modalLeaderboard.classList.add('hidden'));

    this.tabCreate.addEventListener('click', () => {
      this.tabCreate.classList.add('active');
      this.tabJoin.classList.remove('active');
      this.formCreate.classList.add('active');
      this.formJoin.classList.remove('active');
      this.audioEngine.playClick();
    });

    this.tabJoin.addEventListener('click', () => {
      this.tabJoin.classList.add('active');
      this.tabCreate.classList.remove('active');
      this.formJoin.classList.add('active');
      this.formCreate.classList.remove('active');
      this.audioEngine.playClick();
    });

    this.btnCopyCode.addEventListener('click', () => {
      if (this.roomState?.code) {
        navigator.clipboard.writeText(this.roomState.code);
        this.btnCopyCode.textContent = '✓ Copied!';
        setTimeout(() => this.btnCopyCode.textContent = '📋 Copy Link', 2000);
      }
    });
  }

  showScreen(screenId) {
    Object.keys(this.screens).forEach(id => {
      if (id === screenId) {
        this.screens[id].classList.add('active');
      } else {
        this.screens[id].classList.remove('active');
      }
    });
    this.currentScreen = screenId;
  }

  showRandomRoleReveal(killerId, killerName, myId) {
    const isMeKiller = killerId === myId;
    const toast = this.powerupToast;
    const text = this.powerupToastText;

    if (isMeKiller) {
      text.innerHTML = `<strong style="color:#FF3366">👑 YOU ARE THE KILLER!</strong> Eliminate all survivors!`;
      this.audioEngine.playWarningSiren();
    } else {
      text.innerHTML = `<strong style="color:#00E5FF">🛡️ YOU ARE A SURVIVOR!</strong> Evade <strong>${killerName}</strong>!`;
      this.audioEngine.playClick();
    }

    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  updateLobbyRoom(room, myId) {
    this.roomState = room;
    this.myPlayerId = myId;

    if (!room) {
      this.roomWaitingPanel.classList.add('hidden');
      return;
    }

    this.roomWaitingPanel.classList.remove('hidden');
    this.displayRoomCode.textContent = room.code;
    this.playerCountSpan.textContent = room.players.length;
    this.playerMaxSpan.textContent = room.settings.maxPlayers;

    const me = room.players.find(p => p.id === myId);

    this.btnStartGame.classList.remove('hidden');
    this.btnToggleReady.classList.remove('hidden');
    this.readyBtnText.textContent = me?.isReady ? 'UNREADY' : 'READY UP!';

    this.playerListContainer.innerHTML = '';
    room.players.forEach(p => {
      const card = document.createElement('div');
      card.className = `player-card ${p.isReady ? 'is-ready' : ''}`;

      const isMe = p.id === myId;
      card.innerHTML = `
        <div class="player-avatar">${p.isBot ? '🤖' : (p.isHost ? '👑' : '👤')}</div>
        <div class="player-name">${p.name} ${isMe ? '(You)' : ''}</div>
        <div class="status-pill ${p.isReady ? 'status-ready' : 'status-waiting'}">
          ${p.isReady ? 'READY' : 'WAITING'}
        </div>
      `;
      this.playerListContainer.appendChild(card);
    });
  }

  updateHUD(snapshot, myId) {
    const me = snapshot.players.find(p => p.id === myId);
    this.myPlayerId = myId;

    if (me) {
      if (me.role === 'KILLER') {
        this.hudRoleCard.className = 'hud-card role-killer';
        this.hudRoleIcon.textContent = '👑';
        this.hudRoleText.textContent = 'KILLER';
        this.hudRoleText.className = 'hud-value crimson-text';
      } else {
        this.hudRoleCard.className = 'hud-card role-survivor';
        this.hudRoleIcon.textContent = '🛡️';
        this.hudRoleText.textContent = 'SURVIVOR';
        this.hudRoleText.className = 'hud-value cyan-text';
      }

      if (!me.isAlive) {
        this.spectatorBanner.classList.remove('hidden');
      } else {
        this.spectatorBanner.classList.add('hidden');
      }
    }

    const timer = snapshot.timer;
    const mins = Math.floor(timer / 60).toString().padStart(2, '0');
    const secs = (timer % 60).toString().padStart(2, '0');
    this.hudTimerText.textContent = `${mins}:${secs}`;

    if (timer > 90) {
      this.hudTimerBadge.className = 'timer-badge timer-green';
    } else if (timer > 45) {
      this.hudTimerBadge.className = 'timer-badge timer-yellow';
    } else if (timer > 30) {
      this.hudTimerBadge.className = 'timer-badge timer-orange';
    } else {
      this.hudTimerBadge.className = 'timer-badge timer-red';
      if (timer % 5 === 0) this.audioEngine.playWarningSiren();
    }

    const aliveSurvivors = snapshot.players.filter(p => p.role === 'SURVIVOR' && p.isAlive).length;
    const totalSurvivors = snapshot.players.filter(p => p.role === 'SURVIVOR').length;
    const killer = snapshot.players.find(p => p.role === 'KILLER');

    this.hudSurvivorsCount.textContent = `${aliveSurvivors} / ${totalSurvivors}`;
    this.hudKillsCount.textContent = killer ? killer.kills : 0;
  }

  showPowerupToast(powerupType) {
    const icons = {
      SHIELD: '🛡️', INVISIBLE: '👻', SPEED: '⚡', FREEZE: '❄️',
      DASH: '💨', TELEPORT: '🌀', FLASH: '💥', DECOY: '🤖',
      REVEAL: '📡', HEAL: '❤️'
    };

    const icon = icons[powerupType] || '⚡';
    this.powerupToastText.textContent = `${icon} ${powerupType.replace('_', ' ')} EQUIPPED!`;
    this.powerupToast.classList.remove('hidden');
    this.audioEngine.playPowerupPickup(powerupType);

    setTimeout(() => this.powerupToast.classList.add('hidden'), 2500);
  }

  showMatchResults(data) {
    this.showScreen('results');
    const title = document.getElementById('results-title');
    const subtitle = document.getElementById('results-subtitle');

    if (data.winner === 'SURVIVORS_WIN') {
      title.textContent = 'SURVIVORS WIN!';
      subtitle.textContent = data.reason || 'Survivors survived the hunt!';
      this.audioEngine.playVictory();
    } else {
      title.textContent = 'KILLER WINS!';
      subtitle.textContent = data.reason || 'The Killer eliminated all survivors!';
      this.audioEngine.playDefeat();
    }

    const killer = data.stats.find(p => p.role === 'KILLER');
    const escaped = data.stats.filter(p => p.role === 'SURVIVOR' && p.isAlive).length;
    document.getElementById('res-stat-kills').textContent = killer ? killer.kills : 0;
    document.getElementById('res-stat-survivors').textContent = escaped;

    this.scoreboardBody.innerHTML = '';
    data.stats.forEach(p => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${p.name}</strong></td>
        <td><span class="${p.role === 'KILLER' ? 'crimson-text' : 'cyan-text'}">${p.role}</span></td>
        <td>${p.isAlive ? '🟢 Escaped' : '🔴 Dead'}</td>
        <td>${p.kills}</td>
        <td>${p.survivalTime}s</td>
      `;
      this.scoreboardBody.appendChild(row);
    });

    this.saveMatchToLeaderboard(data.stats);
  }

  saveMatchToLeaderboard(statsArr) {
    let lb = JSON.parse(localStorage.getItem('sh_leaderboard') || '[]');

    statsArr.forEach(p => {
      let entry = lb.find(e => e.name === p.name);
      if (!entry) {
        entry = { name: p.name, games: 0, wins: 0, kills: 0 };
        lb.push(entry);
      }
      entry.games++;
      entry.kills += p.kills;
      if (p.isAlive || (p.role === 'KILLER' && p.kills > 0)) entry.wins++;
    });

    localStorage.setItem('sh_leaderboard', JSON.stringify(lb));
  }

  showLeaderboard() {
    this.modalLeaderboard.classList.remove('hidden');
    const lb = JSON.parse(localStorage.getItem('sh_leaderboard') || '[]');
    lb.sort((a, b) => b.wins - a.wins || b.kills - a.kills);

    this.leaderboardBody.innerHTML = '';
    if (lb.length === 0) {
      this.leaderboardBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No match history recorded yet. Play a game!</td></tr>`;
      return;
    }

    lb.forEach((entry, idx) => {
      const winRate = entry.games > 0 ? Math.round((entry.wins / entry.games) * 100) : 0;
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>#${idx + 1}</td>
        <td><strong>${entry.name}</strong></td>
        <td>${entry.games}</td>
        <td>${entry.wins}</td>
        <td>${entry.kills}</td>
        <td><strong class="cyan-text">${winRate}%</strong></td>
      `;
      this.leaderboardBody.appendChild(row);
    });
  }

  updatePing(ms) {
    this.pingContainer.classList.remove('hidden');
    this.pingText.textContent = `${ms} ms`;
  }
}
