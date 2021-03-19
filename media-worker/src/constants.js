export const WORKER_SETTINGS = {
  logLevel: 'debug',
  logTags: [
    'info',
    'ice',
    'dtls',
    'rtp',
    'srtp',
    'rtcp',
    // 'rtx',
    // 'bwe',
    // 'score',
    // 'simulcast',
    // 'svc'
  ],
  rtcMinPort: parseInt(process.env.RTC_MIN_PORT) || 10000,
  rtcMaxPort: parseInt(process.env.RTC_MAX_PORT) || 59999,
}

export const MEDIA_CODECS = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      // 'x-google-start-bitrate': 1000
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      // 'x-google-start-bitrate'  : 1000
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      // 'x-google-start-bitrate'  : 1000
    },
  },
]
