import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/react'
import { videocam } from 'ionicons/icons'
import CameraSelectorCard from '../components/CameraSelectorCard'

function HomePage({
  isConnected,
  hasLocalMediaStream,
  onSubmitSelectedDeviceId,
  onJoinRoomButtonClick,
}) {
  return (
    <IonPage>
      <IonContent>
        <div className='container'>
          {!hasLocalMediaStream ? (
            <CameraSelectorCard
              onSubmitSelectedDeviceId={onSubmitSelectedDeviceId}
            />
          ) : isConnected ? (
            <IonButton onClick={onJoinRoomButtonClick}>
              <IonIcon icon={videocam} /> &nbsp; Join room
            </IonButton>
          ) : (
            <IonSpinner />
          )}
        </div>
      </IonContent>
    </IonPage>
  )
}

export default HomePage
