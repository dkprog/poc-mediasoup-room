import { IonApp } from '@ionic/react'
import { useEffect, useState, useCallback } from 'react'
import * as mediasoup from 'mediasoup-client'

import {
  client,
  startCamera,
  createSendTransport,
  subscribeToRemoteTrack,
} from './client'

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

let device

function App() {
  const [cameraDeviceId, setCameraDeviceId] = useState()
  const [localMediaStream, setLocalMediaStream] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [roomName, setRoomName] = useState()
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false)
  const [onlinePeers, setOnlinePeers] = useState([])
  const [remoteStreams, setRemoteStreams] = useState({})

  const subscribeToRemoteVideoTrack = useCallback(
    async (socketId) => {
      if (!roomName) {
        return
      }

      const videoTrack = await subscribeToRemoteTrack(
        device,
        roomName,
        socketId,
        'cam-video'
      )
      const mediaStream = new MediaStream([videoTrack])

      setRemoteStreams((prevRemoteStreams) => {
        const remoteStreams = { ...prevRemoteStreams }

        remoteStreams[socketId] = mediaStream
        return remoteStreams
      })
    },
    [roomName]
  )

  const closeRemoteVideoTrack = useCallback((socketId) => {
    setRemoteStreams((prevRemoteStreams) => {
      const remoteStreams = { ...prevRemoteStreams }
      if (socketId in remoteStreams) {
        remoteStreams[socketId].getVideoTracks()[0].stop()
        delete remoteStreams[socketId]
      }
      return remoteStreams
    })
  }, [])

  const closeAllRemoteVideoTracks = useCallback(() => {
    setRemoteStreams((prevRemoteStreams) => {
      const remoteStreams = { ...prevRemoteStreams }
      Object.keys(remoteStreams).forEach((socketId) =>
        remoteStreams[socketId].getVideoTracks()[0].stop()
      )
      return {}
    })
  }, [])

  useEffect(() => {
    return () => {
      client.disconnect()
    }
  }, [])

  useEffect(() => {
    setIsConnected(client.connected)

    const onConnect = () => {
      setIsConnected(true)
    }

    const onDisconnect = () => {
      setIsConnected(false)
    }

    const onPeerJoinedRoom = async ({ socketId }) => {
      console.log('peer joined room', { socketId })

      setOnlinePeers((onlinePeers) =>
        onlinePeers
          .filter((peerSocketId) => peerSocketId !== socketId)
          .concat(socketId)
      )

      await subscribeToRemoteVideoTrack(socketId)
    }

    const onPeerLeftRoom = async ({ socketId }) => {
      console.log('peer left room', { socketId })

      setOnlinePeers((onlinePeers) =>
        onlinePeers.filter((peerSocketId) => peerSocketId !== socketId)
      )
      await closeRemoteVideoTrack(socketId)
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
  }, [subscribeToRemoteVideoTrack, closeRemoteVideoTrack])

  useEffect(() => {
    if (!cameraDeviceId) {
      return
    }
    const getLocalMediaStream = async () => {
      setLocalMediaStream(await startCamera(cameraDeviceId))
    }

    getLocalMediaStream()
  }, [cameraDeviceId])

  useEffect(() => {
    if (!roomName || !isConnected || !localMediaStream) {
      return
    }

    const emitWelcome = () => {
      client.emit(
        'welcome',
        { roomName },
        async ({ routerRtpCapabilities }) => {
          device = new mediasoup.Device()
          await device.load({ routerRtpCapabilities })

          if (!device.canProduce('video')) {
            console.error("This device can't produce video")
          } else {
            await createSendTransport(device, roomName, localMediaStream)
            client.emit('join', { roomName }, ({ onlinePeers }) => {
              console.log('joined', { roomName, onlinePeers })
              setHasJoinedRoom(true)
              setOnlinePeers(onlinePeers)
              onlinePeers.forEach(async (toSocketId) => {
                await subscribeToRemoteVideoTrack(toSocketId)
              })
            })
          }
        }
      )
    }

    emitWelcome()
  }, [roomName, isConnected, localMediaStream, subscribeToRemoteVideoTrack])

  const onSelectDeviceId = (deviceId) => {
    setCameraDeviceId(deviceId)
  }

  const onSelectRoom = (roomName) => {
    setRoomName(roomName)
  }

  const onLeftRoomButtonClick = () => {
    client.emit('leave', () => {
      console.log(`left ${roomName}`)
      setRoomName(null)
      setHasJoinedRoom(false)
      setOnlinePeers([])
      closeAllRemoteVideoTracks()
    })
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
          onSubmitSelectedDeviceId={onSelectDeviceId}
          onSelectRoom={onSelectRoom}
          hasLocalMediaStream={!!localMediaStream}
          hasSelectedRoom={!!roomName}
        />
      )}
    </IonApp>
  )
}

export default App
