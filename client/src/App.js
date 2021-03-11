import { IonApp } from '@ionic/react'
import { io } from 'socket.io-client'
import { useCallback, useEffect, useState } from 'react'
import * as mediasoup from 'mediasoup-client'

import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'

import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'

const CAM_VIDEO_SIMULCAST_ENCODINGS = [
  { maxBitrate: 96000, scaleResolutionDownBy: 4 },
  { maxBitrate: 680000, scaleResolutionDownBy: 1 },
]

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false)
  const [localMediaStream, setLocalMediaStream] = useState(null)
  const [cameraDeviceId, setCameraDeviceId] = useState()
  const [device, setDevice] = useState(null)
  const [deviceLoaded, setDeviceLoaded] = useState(false)
  const [client, setClient] = useState(null)
  const [sendTransport, setSendTransport] = useState(null)
  const [, /*cameraVideoProducer*/ setCameraVideoProducer] = useState(null)
  const [onlinePeers, setOnlinePeers] = useState([])
  const [recvTransports, setRecvTransports] = useState({}) // { [socketId] : recvTransport }
  const [consumers, setConsumers] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({})
  const [roomName, setRoomName] = useState()

  useEffect(() => {
    if (!cameraDeviceId) {
      return
    }
    async function startCamera() {
      let localStream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraDeviceId,
          },
          audio: false,
        })
        setLocalMediaStream(localStream)
      } catch (error) {
        console.error('start camera error', error)
      }
    }

    startCamera()
  }, [cameraDeviceId])

  useEffect(() => {
    try {
      const device = new mediasoup.Device()
      setDevice(device)
    } catch (error) {
      if (error.name === 'UnsupportedError') {
        console.error('browser not supported for video calls')
        return
      } else {
        console.error(error)
      }
    }
  }, [])

  useEffect(() => {
    if (!device) {
      return
    }

    const client = io(process.env.REACT_APP_SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    })

    setClient(client)
  }, [device])

  const createTransport = useCallback(
    async (direction, toSocketId) => {
      if (!client || !device || !deviceLoaded || !isConnected || !roomName) {
        return null
      }
      console.log(`create ${direction} transport`)

      let { transportOptions } = await new Promise((resolve, reject) => {
        client.emit(
          'create-transport',
          { direction, toSocketId },
          (payload) => {
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
            },
            (payload) => {
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
                },
                (payload) => {
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
        if (
          state === 'closed' ||
          state === 'failed' ||
          state === 'disconnected'
        ) {
          // TODO: reconnect socket-io
        }
      })

      return transport
    },
    [client, device, deviceLoaded, isConnected, roomName]
  )

  useEffect(() => {
    const createSendTransport = async () => {
      const sendTransport = await createTransport('send')
      if (sendTransport) {
        setSendTransport(sendTransport)
      }
    }
    createSendTransport()
  }, [createTransport])

  const closeTransport = useCallback(
    async (transportId) => {
      if (!client || !isConnected) {
        return false
      }

      console.log('close transport', { transportId })

      await new Promise((resolve, reject) => {
        client.emit('close-transport', { transportId }, (payload) => {
          if ('error' in payload) {
            reject(payload.error)
          } else {
            resolve()
          }
        })
      })

      console.log('transport closed', { transportId })
    },
    [client, isConnected]
  )

  const closeSendTransport = useCallback(async () => {
    if (!sendTransport) {
      return
    }

    try {
      await closeTransport(sendTransport.id)
    } finally {
      setSendTransport(null)
    }
  }, [closeTransport, sendTransport])

  useEffect(() => {
    const createCameraVideoProducer = async () => {
      if (!localMediaStream || !sendTransport) {
        return
      }

      const videoProducer = await sendTransport.produce({
        track: localMediaStream.getVideoTracks()[0],
        encoding: CAM_VIDEO_SIMULCAST_ENCODINGS,
        appData: { mediaTag: 'cam-video' },
      })

      setCameraVideoProducer(videoProducer)
    }
    createCameraVideoProducer()
  }, [localMediaStream, sendTransport])

  const createRecvTransport = useCallback(
    async (toSocketId) => {
      if (toSocketId in recvTransports) {
        return recvTransports[toSocketId]
      }

      const recvTransport = await createTransport('recv', toSocketId)
      setRecvTransports((prevRecvTransports) => ({
        ...prevRecvTransports,
        [toSocketId]: recvTransport,
      }))
      return recvTransport
    },
    [recvTransports, createTransport]
  )

  const closeRecvTransport = useCallback(
    async (toSocketId) => {
      if (toSocketId in recvTransports) {
        await recvTransports[toSocketId].close()
        setRecvTransports((prevRecvTransports) => {
          const newRecvTransports = { ...prevRecvTransports }
          delete newRecvTransports[toSocketId]
          return newRecvTransports
        })
      }
    },
    [recvTransports]
  )

  const subscribeToRemoteTrack = useCallback(
    async (toSocketId, mediaTag) => {
      if (!client || !isConnected || !device || !deviceLoaded) {
        return
      }

      let recvTransport = await createRecvTransport(toSocketId)

      const consumerParameters = await new Promise((resolve, reject) => {
        client.emit(
          'recv-track',
          {
            toSocketId,
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
        appData: { toSocketId, mediaTag },
      })

      setConsumers((consumers) => consumers.concat(consumer))
    },
    [createRecvTransport, client, isConnected, device, deviceLoaded]
  )

  const subscribeToRemoteVideoTrack = useCallback(
    async (toSocketId) => {
      await subscribeToRemoteTrack(toSocketId, 'cam-video')
    },
    [subscribeToRemoteTrack]
  )

  const removeClosedConsumers = useCallback(() => {
    setConsumers((consumers) =>
      consumers.filter((consumer) => !consumer.closed)
    )
  }, [])

  useEffect(() => {
    if (!client) {
      return
    }

    const onConnect = () => {
      console.log('connected')
      setIsConnected(true)
    }

    const onDisconnect = async () => {
      console.log('disconnected')
      setIsConnected(false)
      setHasJoinedRoom(false)
      await closeSendTransport()
    }

    const onPeerJoinedRoom = async ({ socketId }) => {
      console.log(`peer joined room`, { socketId })

      setOnlinePeers((onlinePeers) =>
        onlinePeers
          .filter((peerSocketId) => peerSocketId !== socketId)
          .concat(socketId)
      )
      await subscribeToRemoteVideoTrack(socketId)
    }

    const onPeerLeftRoom = ({ socketId }) => {
      console.log(`peer left room`, { socketId })
      setOnlinePeers((onlinePeers) =>
        onlinePeers.filter((peerSocketId) => peerSocketId !== socketId)
      )
      closeRecvTransport(socketId)
      removeClosedConsumers()
    }

    client.on('connect', onConnect)
    client.on('disconnect', onDisconnect)
    client.on('peer-joined', onPeerJoinedRoom)
    client.on('peer-left', onPeerLeftRoom)

    return () => {
      client.off('connect', onConnect)
      client.off('disconnect', onDisconnect)
      client.off('peer-joined', onPeerJoinedRoom)
      client.off('peer-left', onPeerLeftRoom)
    }
  }, [
    client,
    device,
    subscribeToRemoteVideoTrack,
    closeRecvTransport,
    removeClosedConsumers,
    closeSendTransport,
  ])

  useEffect(() => {
    const remoteStreams = {}

    consumers.forEach((consumer) => {
      const { toSocketId } = consumer.appData
      remoteStreams[toSocketId] = new MediaStream([consumer.track.clone()])
    })

    setRemoteStreams(remoteStreams)
  }, [consumers])

  const onJoinRoom = (roomName) => {
    if (client) {
      client.emit(
        'join',
        { roomName },
        async ({ onlinePeers, routerRtpCapabilities }) => {
          if (!device.loaded) {
            await device.load({ routerRtpCapabilities })
            setDeviceLoaded(device.loaded)
          }
          if (!device.canProduce('video')) {
            throw new Error("device can't produce video!")
          }
          console.log('joined', {
            roomName,
            onlinePeers,
            routerRtpCapabilities,
          })
          setHasJoinedRoom(true)
          setOnlinePeers(onlinePeers)
          setRoomName(roomName)
          onlinePeers.forEach(async (toSocketId) => {
            await subscribeToRemoteVideoTrack(toSocketId)
          })
        }
      )
    }
  }

  const onLeftRoomButtonClick = useCallback(async () => {
    const closeAllRecvTransports = async () => {
      onlinePeers.forEach(async (toSocketId) => {
        if (toSocketId in recvTransports) {
          await recvTransports[toSocketId].close()
        }
      })
    }

    if (client) {
      await closeSendTransport()
      client.emit('leave', async () => {
        await closeAllRecvTransports()
        await removeClosedConsumers()
        setHasJoinedRoom(false)
        setOnlinePeers([])
        setRecvTransports({})
        setRoomName(null)
      })
    }
  }, [
    client,
    onlinePeers,
    recvTransports,
    removeClosedConsumers,
    closeSendTransport,
  ])

  const onSubmitSelectedDeviceId = (deviceId) => {
    setCameraDeviceId(deviceId)
  }

  return (
    <IonApp>
      {hasJoinedRoom ? (
        <RoomPage
          roomName={roomName}
          localMediaStream={localMediaStream}
          onLeftRoomButtonClick={onLeftRoomButtonClick}
          onlinePeers={onlinePeers}
          remoteStreams={remoteStreams}
        />
      ) : (
        <HomePage
          isConnected={isConnected}
          onJoinRoom={onJoinRoom}
          onSubmitSelectedDeviceId={onSubmitSelectedDeviceId}
          hasLocalMediaStream={!!localMediaStream}
        />
      )}
    </IonApp>
  )
}

export default App
