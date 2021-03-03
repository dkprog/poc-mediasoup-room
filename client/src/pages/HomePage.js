import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/react'
import { videocam } from 'ionicons/icons'

function HomePage({ isConnected, onJoinRoomButtonClick }) {
  return (
    <IonPage>
      <IonContent>
        <div className='container'>
          {isConnected ? (
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
