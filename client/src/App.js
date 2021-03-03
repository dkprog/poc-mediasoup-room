import { IonApp } from '@ionic/react'
import { io } from 'socket.io-client'
import { useEffect, useState } from 'react'
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

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [hasJoinedRoom] = useState(false)
  const [localMediaStream, setLocalMediaStream] = useState(null)
  const [device, setDevice] = useState(null)
  const [client, setClient] = useState(null)

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
    }

    const onWelcome = async ({ routerRtpCapabilities }) => {
      console.log('received a welcome', { routerRtpCapabilities })
      if (!device.loaded) {
        await device.load({ routerRtpCapabilities })
      }
      if (!device.canProduce('video')) {
        throw new Error("device can't produce video!")
      }
    }

    client.on('connect', onConnect)
    client.on('disconnect', onDisconnect)
    client.on('welcome', onWelcome)

    return () => {
      client.off('connect', onConnect)
      client.off('disconnect', onDisconnect)
      client.off('welcome', onWelcome)
    }
  }, [client, device])

  return (
    <IonApp>
      {hasJoinedRoom ? (
        <RoomPage localMediaStream={localMediaStream} />
      ) : (
        <HomePage isConnected={isConnected} />
      )}
    </IonApp>
  )
}

export default App
