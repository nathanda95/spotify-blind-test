import crypto from 'node:crypto';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeMultiplayerAnswer(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(feat\.?|ft\.?|featuring)\b.*$/g, '')
    .replace(/\b(remastered|radio edit|edit|live|version|explicit)\b/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTitleMatch(userAnswer, expectedTitle) {
  const user = normalizeMultiplayerAnswer(userAnswer);
  const expected = normalizeMultiplayerAnswer(expectedTitle);
  if (!user || !expected) return false;
  if (user === expected) return true;
  return user.length >= 4 && (expected.includes(user) || user.includes(expected));
}

function isArtistMatch(userAnswer, expectedArtists) {
  const user = normalizeMultiplayerAnswer(userAnswer);
  if (!user) return false;
  return expectedArtists.some((artist) => normalizeMultiplayerAnswer(artist) === user);
}

function scoreAnswer(question, answerMode, titleAnswer, artistAnswer) {
  if (answerMode === 'either') {
    const answer = titleAnswer || artistAnswer;
    const isTitleCorrect = isTitleMatch(answer, question.title);
    const isArtistCorrect = isArtistMatch(answer, question.artists);
    return {
      isTitleCorrect,
      isArtistCorrect,
      points: isTitleCorrect || isArtistCorrect ? 1 : 0,
    };
  }

  const isTitleCorrect = answerMode !== 'artist' && isTitleMatch(titleAnswer, question.title);
  const isArtistCorrect =
    answerMode !== 'title' && isArtistMatch(artistAnswer, question.artists);

  return {
    isTitleCorrect,
    isArtistCorrect,
    points: Number(isTitleCorrect) + Number(isArtistCorrect),
  };
}

function generateRoomCode(existingCodes) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = Array.from({ length: 6 }, () =>
      ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)],
    ).join('');
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('Impossible de generer un code de room unique.');
}

function createPlayer({ id, socketId, pseudo, role }) {
  return {
    id,
    socketId,
    pseudo,
    role,
    connected: true,
    score: 0,
    correctAnswers: 0,
    totalResponseMs: 0,
    responseCount: 0,
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    pseudo: player.pseudo,
    role: player.role,
    connected: player.connected,
    score: player.score,
    correctAnswers: player.correctAnswers,
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    status: room.status,
    host: room.host,
    players: [...room.players.values()].map(publicPlayer),
    currentQuestionIndex: room.currentQuestionIndex,
    questionCount: room.questions.length,
    answerMode: room.answerMode,
    listenDurationSeconds: room.listenDurationSeconds,
    currentQuestionLockedByPlayerId: room.currentQuestionLockedByPlayerId,
  };
}

function leaderboard(room) {
  return [...room.players.values()]
    .map((player) => ({
      id: player.id,
      pseudo: player.pseudo,
      role: player.role,
      score: player.score,
      correctAnswers: player.correctAnswers,
      averageResponseMs:
        player.responseCount > 0
          ? Math.round(player.totalResponseMs / player.responseCount)
          : null,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      const aAverage = a.averageResponseMs ?? Number.POSITIVE_INFINITY;
      const bAverage = b.averageResponseMs ?? Number.POSITIVE_INFINITY;
      return aAverage - bAverage;
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function publicQuestion(room) {
  return {
    questionNumber: room.currentQuestionIndex + 1,
    totalQuestions: room.questions.length,
    listenDurationSeconds: room.listenDurationSeconds,
    answerMode: room.answerMode,
  };
}

function hostQuestion(room) {
  const question = room.questions[room.currentQuestionIndex];
  return {
    trackUri: question.uri,
    title: question.title,
    artists: question.artists,
    album: question.album,
    imageUrl: question.imageUrl,
    durationMs: question.durationMs,
  };
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketToRoomCode = new Map();
    this.socketToPlayerId = new Map();
  }

  createRoom(hostSocketId, hostUser) {
    const code = generateRoomCode(this.rooms);
    const hostPlayerId = `host_${hostUser.id}`;
    const hostPseudo = hostUser.display_name || hostUser.email || 'Host';
    const hostPlayer = createPlayer({
      id: hostPlayerId,
      socketId: hostSocketId,
      pseudo: hostPseudo,
      role: 'host',
    });
    const room = {
      code,
      hostSocketId,
      host: {
        id: hostUser.id,
        displayName: hostPseudo,
      },
      status: 'lobby',
      players: new Map([[hostPlayer.id, hostPlayer]]),
      currentQuestionIndex: 0,
      questions: [],
      currentQuestionLockedByPlayerId: null,
      answers: [],
      answerMode: 'title',
      listenDurationSeconds: 10,
      questionStartedAt: null,
    };

    this.rooms.set(code, room);
    this.indexSocket(hostSocketId, code, hostPlayer.id);
    return { room, player: hostPlayer };
  }

  joinRoom(code, socketId, pseudo) {
    const room = this.rooms.get(String(code).trim().toUpperCase());
    const cleanPseudo = String(pseudo ?? '').trim();
    if (!cleanPseudo) throw new Error('Pseudo obligatoire.');
    if (!room) throw new Error('Room introuvable.');
    if (room.status === 'finished') throw new Error('Cette room est terminee.');

    const player = createPlayer({
      id: crypto.randomUUID(),
      socketId,
      pseudo: cleanPseudo.slice(0, 32),
      role: 'guest',
    });
    room.players.set(player.id, player);
    this.indexSocket(socketId, room.code, player.id);
    return { room, player };
  }

  startGame(code, socketId, setup, tracks) {
    const room = this.requireHostRoom(code, socketId);
    if (room.status !== 'lobby') throw new Error('La partie a deja demarre.');

    room.answerMode = setup.answerMode;
    room.listenDurationSeconds = setup.listenDurationSeconds;
    room.questions = tracks.map((track, index) => ({
      index,
      spotifyTrackId: track.spotifyTrackId,
      uri: track.uri,
      title: track.title,
      artists: track.artists,
      album: track.album,
      imageUrl: track.imageUrl,
      durationMs: track.durationMs,
    }));
    room.currentQuestionIndex = 0;
    room.currentQuestionLockedByPlayerId = null;
    room.answers = [];
    room.status = 'playing';
    room.questionStartedAt = Date.now();

    return room;
  }

  submitAnswer(code, socketId, payload) {
    const room = this.rooms.get(String(code).trim().toUpperCase());
    if (!room) throw new Error('Room introuvable.');
    if (room.status !== 'playing') throw new Error('La partie nest pas en cours.');
    if (room.currentQuestionLockedByPlayerId) return { room, ignored: true };

    const playerId = this.socketToPlayerId.get(socketId);
    const player = playerId ? room.players.get(playerId) : null;
    if (!player || !player.connected) throw new Error('Joueur introuvable.');

    const question = room.questions[room.currentQuestionIndex];
    const scoring = scoreAnswer(
      question,
      room.answerMode,
      payload.titleAnswer,
      payload.artistAnswer,
    );
    const responseMs = room.questionStartedAt ? Date.now() - room.questionStartedAt : 0;

    room.currentQuestionLockedByPlayerId = player.id;
    player.score += scoring.points;
    if (scoring.points > 0) player.correctAnswers += 1;
    if (responseMs > 0) {
      player.totalResponseMs += responseMs;
      player.responseCount += 1;
    }

    const answer = {
      questionIndex: room.currentQuestionIndex,
      playerId: player.id,
      playerPseudo: player.pseudo,
      titleAnswer: String(payload.titleAnswer ?? '').trim(),
      artistAnswer: String(payload.artistAnswer ?? '').trim(),
      isTitleCorrect: scoring.isTitleCorrect,
      isArtistCorrect: scoring.isArtistCorrect,
      points: scoring.points,
      responseMs,
      correctAnswer: {
        title: question.title,
        artists: question.artists,
      },
    };
    room.answers.push(answer);
    return { room, answer, ignored: false };
  }

  nextQuestion(code, socketId) {
    const room = this.requireHostRoom(code, socketId);
    if (room.status !== 'playing') throw new Error('La partie nest pas en cours.');
    if (room.currentQuestionIndex + 1 >= room.questions.length) {
      room.status = 'finished';
      return { room, finished: true };
    }

    room.currentQuestionIndex += 1;
    room.currentQuestionLockedByPlayerId = null;
    room.questionStartedAt = Date.now();
    return { room, finished: false };
  }

  closeRoom(code, socketId) {
    const room = this.requireHostRoom(code, socketId);
    this.deleteRoom(room.code);
    return room;
  }

  handleDisconnect(socketId) {
    const code = this.socketToRoomCode.get(socketId);
    const playerId = this.socketToPlayerId.get(socketId);
    if (!code || !playerId) return null;

    const room = this.rooms.get(code);
    if (!room) return null;
    if (room.hostSocketId === socketId) {
      this.deleteRoom(code);
      return { room, closed: true };
    }

    const player = room.players.get(playerId);
    if (player) {
      room.players.delete(playerId);
    }
    this.socketToRoomCode.delete(socketId);
    this.socketToPlayerId.delete(socketId);
    return { room, player, closed: false };
  }

  indexSocket(socketId, code, playerId) {
    this.socketToRoomCode.set(socketId, code);
    this.socketToPlayerId.set(socketId, playerId);
  }

  deleteRoom(code) {
    const room = this.rooms.get(code);
    if (!room) return;
    for (const player of room.players.values()) {
      this.socketToRoomCode.delete(player.socketId);
      this.socketToPlayerId.delete(player.socketId);
    }
    this.rooms.delete(code);
  }

  requireHostRoom(code, socketId) {
    const room = this.rooms.get(String(code).trim().toUpperCase());
    if (!room) throw new Error('Room introuvable.');
    if (room.hostSocketId !== socketId) throw new Error('Action reservee au host.');
    return room;
  }

  publicRoom(room) {
    return publicRoom(room);
  }

  leaderboard(room) {
    return leaderboard(room);
  }

  publicQuestion(room) {
    return publicQuestion(room);
  }

  hostQuestion(room) {
    return hostQuestion(room);
  }
}
