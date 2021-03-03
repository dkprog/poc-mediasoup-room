import {
  IonPage,
  IonContent,
  IonFooter,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
} from '@ionic/react'
import { exit } from 'ionicons/icons'
import { useEffect, useRef } from 'react'
import RemoteVideoCard from '../components/RemoteVideoCard'

function RoomPage({ localMediaStream, onLeftRoomButtonClick, onlinePeers }) {
  const localVideoEl = useRef(null)

  useEffect(() => {
    if (localVideoEl.current) {
      localVideoEl.current.srcObject = localMediaStream
    }
  }, [localVideoEl, localMediaStream])

  const remoteVideoCards = onlinePeers.map((socketId) => (
    <RemoteVideoCard title={`peer#${socketId}`} key={socketId} />
  ))

  return (
    <IonPage>
      <IonContent>
        <div className='container containerRow'>{remoteVideoCards}</div>
      </IonContent>
      <IonFooter>
        <video playsInline autoPlay ref={localVideoEl} className='localVideo' />
        <IonToolbar>
          <IonButtons slot='start'></IonButtons>
          <IonButtons slot='end'>
            <IonButton color='danger' onClick={onLeftRoomButtonClick}>
              <IonIcon icon={exit} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonPage>
  )
}

export default RoomPage
