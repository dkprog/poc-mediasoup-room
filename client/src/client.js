import { io } from 'socket.io-client'
// import * as mediasoup from 'mediasoup-client'

const CAM_VIDEO_SIMULCAST_ENCODINGS = [
  { maxBitrate: 96000, scaleResolutionDownBy: 4 },
  { maxBitrate: 680000, scaleResolutionDownBy: 1 },
]

let client = io(process.env.REACT_APP_SIGNALING_SERVER_URL, {
  transports: ['websocket'],
})

async function startCamera(deviceId) {
  let localStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId,
      },
      audio: false,
    })
  } catch (error) {
    console.error('start camera error', error)
    return null
  }
  return localStream
}

async function createTransport(device, direction, roomName, toSocketId) {
  console.log(`create ${direction} transport`)

  let { transportOptions } = await new Promise((resolve, reject) => {
    client.emit(
      'create-transport',
      { direction, toSocketId, roomName },
      (payload) => {
        // TODO: it should have a timeout
        if ('error' in payload) {
          reject(payload.error)
        } else {
          resolve(payload)
        }
      }
    )
  })

  console.log('received transport options', transportOptions)

  let transport
  if (direction === 'recv') {
    transport = await device.createRecvTransport(transportOptions)
  } else if (direction === 'send') {
    transport = await device.createSendTransport(transportOptions)
  } else {
    throw new Error(`bad transport 'direction': ${direction}`)
  }

  transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    console.log('transport connect event', { direction })

    let { error } = await new Promise(function (resolve) {
      client.emit(
        'connect-transport',
        {
          transportId: transportOptions.id,
          dtlsParameters,
          roomName,
        },
        (payload) => {
          // TODO: it should have a timeout
          resolve(payload)
        }
      )
    })

    if (error) {
      console.error('error connecting transport', { direction, error })
      errback()
    } else {
      callback()
    }
  })

  if (direction === 'send') {
    transport.on(
      'produce',
      async ({ kind, rtpParameters, appData }, callback, errback) => {
        console.log('transport produce event', {
          kind,
          rtpParameters,
          mediaTag: appData.mediaTag,
        })

        let { error, id } = await new Promise(function (resolve) {
          client.emit(
            'send-track',
            {
              transportId: transportOptions.id,
              kind,
              rtpParameters,
              paused: false, // TODO: play with it
              appData,
              roomName,
            },
            (payload) => {
              // TODO: it should have a timeout
              resolve(payload)
            }
          )
        })
        if (error) {
          console.error('error setting up server-side producer', { error })
          errback()
        } else {
          callback({ id })
        }
      }
    )
  }

  transport.on('connectionstatechange', (state) => {
    console.log(`transport ${transport.id} connectionstatechange ${state}`)
    if (state === 'closed' || state === 'failed' || state === 'disconnected') {
      // TODO: reconnect socket-io
    }
  })

  return transport
}

async function sendStream(device, roomName, localMediaStream) {
  const sendTransport = await createTransport(device, 'send', roomName)
  await createVideoProducer(sendTransport, localMediaStream)
}

async function createVideoProducer(sendTransport, localMediaStream) {
  return sendTransport.produce({
    track: localMediaStream.getVideoTracks()[0],
    encoding: CAM_VIDEO_SIMULCAST_ENCODINGS,
    appData: { mediaTag: 'cam-video' },
  })
}

async function receiveVideoTrack(device, roomName, fromSocketId) {
  return receiveTrack(device, roomName, fromSocketId, 'cam-video')
}

async function receiveTrack(device, roomName, fromSocketId, mediaTag) {
  const recvTransport = await createTransport(device, 'recv', roomName)

  const consumerParameters = await new Promise((resolve, reject) => {
    client.emit(
      'recv-track',
      {
        fromSocketId,
        mediaTag,
        rtpCapabilities: device.rtpCapabilities,
        transportId: recvTransport.id,
      },
      (payload) => {
        if ('error' in payload) {
          return reject(payload.error)
        } else {
          return resolve(payload)
        }
      }
    )
  })

  console.log('consumer parameters', { consumerParameters })

  const consumer = await recvTransport.consume({
    ...consumerParameters,
    appData: { toSocketId: fromSocketId, mediaTag },
  })

  return consumer
}

export { client, startCamera, createTransport, sendStream, receiveVideoTrack }
