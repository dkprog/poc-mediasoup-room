import { IonApp } from '@ionic/react'
import { io } from 'socket.io-client'
import { useEffect, useState } from 'react'

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
  const [client, setClient] = useState(null)

  useEffect(() => {
    const client = io(process.env.REACT_APP_SIGNALING_SERVER_URL, {
      transports: ['websocket'],
    })

    setClient(client)
  }, [])

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

    client.on('connect', onConnect)
    client.on('disconnect', onDisconnect)

    return () => {
      client.off('connect', onConnect)
      client.off('disconnect', onDisconnect)
    }
  }, [client])

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
