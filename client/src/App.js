import { IonApp } from '@ionic/react'

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

import { useEffect, useState } from 'react'

function App() {
  const [isConnected] = useState(true)
  const [hasJoinedRoom] = useState(true)
  const [localMediaStream, setLocalMediaStream] = useState(null)

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
