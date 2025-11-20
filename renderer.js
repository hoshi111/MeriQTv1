const { ipcRenderer } = require('electron');

const queryInput = document.getElementById('query');
const searchBtn = document.getElementById('search');
const results = document.getElementById('results');
const player = document.getElementById('player');
const btn = document.getElementById('playpause');
const trackbar = document.getElementById('trackbar');
const nextBtn = document.getElementById('next');
const backBtn = document.getElementById('back');
const titleEl = document.getElementById('title');

let isPlaying = false;
let lastPlayedLi = null;
let songList = [];       // all <li> including top + suggested
let currentIndex = 0;

// Play a song
async function playSong(song, liElement = null, isFirstSelection = false) {
  // Update title
  titleEl.textContent = song.name + (song.artist.name ? " - " + song.artist.name : "");

  // Reset last played li color
  if (lastPlayedLi && lastPlayedLi !== liElement) {
    lastPlayedLi.style.color = "";
    lastPlayedLi.style.backgroundColor = "";
    lastPlayedLi.style.fontWeight = "";
  }

  // Highlight current li
  if (liElement) {
    liElement.style.backgroundColor = "#1a4b5eff";
    liElement.style.color = "white";
    liElement.style.fontWeight = "bold";
    lastPlayedLi = liElement;
    currentIndex = songList.indexOf(liElement);
  }

  // Fetch audio stream
  const stream = await ipcRenderer.invoke('yt-getAudio', song.videoId);
  if (!stream.error) {
    player.src = stream.url;
    player.play();
    btn.src = "icons/pause.png";
    isPlaying = true;
  } else {
    console.error(stream.error);
  }

  // Only for first selection, show suggestions
  if (isFirstSelection) {
    results.innerHTML = '';
    songList = [];

    // Add top selected song
    const topLi = document.createElement('li');
    topLi.textContent = song.name + ' - ' + song.artist.name;
    topLi.dataset.videoId = song.videoId;
    topLi.style.backgroundColor = "#1a4b5eff";
    topLi.style.color = "white";
    topLi.style.fontWeight = "bold";
    topLi.classList.add("top-song");
    results.appendChild(topLi);
    songList.push(topLi);
    lastPlayedLi = topLi;
    currentIndex = 0;

    // Fetch suggestions
    const suggestions = await ipcRenderer.invoke('yt-getSuggestions', song.videoId);
    if (suggestions.error) return;

    suggestions.forEach(nextSong => {
      const li = document.createElement('li');
      li.textContent = nextSong.name + ' - ' + nextSong.artist.name;
      li.dataset.videoId = nextSong.videoId;

      li.onclick = () => playSong(nextSong, li, false);
      results.appendChild(li);
      songList.push(li);
    });
  }
}

async function search() {
  const query = queryInput.value.trim();
  if (!query) return;

  const searchResults = await ipcRenderer.invoke('yt-search', query);
  if (searchResults.error) {
    console.error(searchResults.error);
    return;
  }

  results.innerHTML = '';
  songList = [];

  searchResults.forEach(song => {
    const li = document.createElement('li');
    li.textContent = song.name + ' - ' + song.artist.name;
    li.dataset.videoId = song.videoId;

    li.onclick = () => playSong(song, li, true); // first selection → clear + fetch suggestions
    results.appendChild(li);
    songList.push(li);
  });
}

queryInput.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    search();
  }
})

// Search results
searchBtn.addEventListener('click', async () => {
  search();
});

// Play/Pause
btn.addEventListener('click', () => {
  if (isPlaying) {
    player.pause();
    btn.src = "icons/play.png";
    isPlaying = false;
  } else {
    player.play();
    btn.src = "icons/pause.png";
    isPlaying = true;
  }
});

// Trackbar
player.addEventListener('timeupdate', () => {
  if (!player.duration) return;
  trackbar.value = (player.currentTime / player.duration) * 100;
});
trackbar.addEventListener('input', () => {
  if (!player.duration) return;
  player.currentTime = (trackbar.value / 100) * player.duration;
});

// Auto play next
player.addEventListener('ended', () => playNext());

// Next / Previous
nextBtn.addEventListener('click', () => playNext());
backBtn.addEventListener('click', () => playPrevious());

function playNext() {
    player.pause();
    if (!songList.length) return;
    currentIndex = (currentIndex + 1) % songList.length;
    const li = songList[currentIndex];
    playSong({ videoId: li.dataset.videoId, name: li.textContent, artist: '' }, li);
}

function playPrevious() {
    player.pause();
    if (!songList.length) return;
    currentIndex = (currentIndex - 1 + songList.length) % songList.length;
    const li = songList[currentIndex];
    playSong({ videoId: li.dataset.videoId, name: li.textContent, artist: '' }, li);
}
