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
  const [device, setDevice] = useState(null)
  const [deviceLoaded, setDeviceLoaded] = useState(false)
  const [client, setClient] = useState(null)
  const [sendTransport, setSendTransport] = useState(null)
  const [, /*cameraVideoProducer*/ setCameraVideoProducer] = useState(null)

  useEffect(() => {
    async function startCamera() {
      let localStream
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
        setLocalMediaStream(localStream)
      } catch (error) {
        console.error('start camera error', error)
      }
    }

    startCamera()
  }, [])

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
    async (direction) => {
      if (!client || !device || !deviceLoaded || !isConnected) {
        return null
      }
      console.log(`create ${direction} transport`)

      let { transportOptions } = await new Promise((resolve) => {
        client.emit('create-transport', { direction }, (payload) =>
          resolve(payload)
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
    [client, device, deviceLoaded, isConnected]
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

  useEffect(() => {
    if (!client) {
      return
    }

    const onConnect = () => {
      console.log('connected')
      setIsConnected(true)
    }

    const onDisconnect = () => {
      console.log('disconnected')
      setIsConnected(false)
      setHasJoinedRoom(false)
    }

    const onWelcome = async ({ routerRtpCapabilities }) => {
      console.log('received a welcome', { routerRtpCapabilities })
      if (!device.loaded) {
        await device.load({ routerRtpCapabilities })
        setDeviceLoaded(device.loaded)
      }
      if (!device.canProduce('video')) {
        throw new Error("device can't produce video!")
      }
    }

    const onPeerJoinedRoom = ({ socketId }) => {
      console.log(`peer joined room`, { socketId })
    }

    const onPeerLeftRoom = ({ socketId }) => {
      console.log(`peer left room`, { socketId })
    }

    client.on('connect', onConnect)
    client.on('disconnect', onDisconnect)
    client.on('welcome', onWelcome)
    client.on('peer-joined', onPeerJoinedRoom)
    client.on('peer-left', onPeerLeftRoom)

    return () => {
      client.off('connect', onConnect)
      client.off('disconnect', onDisconnect)
      client.off('welcome', onWelcome)
      client.off('peer-joined', onPeerJoinedRoom)
      client.off('peer-left', onPeerLeftRoom)
    }
  }, [client, device])

  const onJoinRoomButtonClick = () => {
    if (client) {
      client.emit('join', () => {
        setHasJoinedRoom(true)
      })
    }
  }

  const onLeftRoomButtonClick = () => {
    if (client) {
      client.emit('leave', () => {
        setHasJoinedRoom(false)
      })
    }
  }

  return (
    <IonApp>
      {hasJoinedRoom ? (
        <RoomPage
          localMediaStream={localMediaStream}
          onLeftRoomButtonClick={onLeftRoomButtonClick}
        />
      ) : (
        <HomePage
          isConnected={isConnected}
          onJoinRoomButtonClick={onJoinRoomButtonClick}
        />
      )}
    </IonApp>
  )
}

export default App
