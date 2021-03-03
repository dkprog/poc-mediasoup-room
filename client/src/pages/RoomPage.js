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

function RoomPage({ localMediaStream, onLeftRoomButtonClick }) {
  const localVideoEl = useRef(null)

  useEffect(() => {
    if (localVideoEl.current) {
      localVideoEl.current.srcObject = localMediaStream
    }
  }, [localVideoEl, localMediaStream])

  return (
    <IonPage>
      <IonContent>
        <div className='container containerRow'>
          <RemoteVideoCard remoteStream={localMediaStream} title='peer#1' />
          <RemoteVideoCard remoteStream={localMediaStream} title='peer#2' />
          <RemoteVideoCard remoteStream={localMediaStream} title='peer#3' />
          <RemoteVideoCard title='peer#4' />
        </div>
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
