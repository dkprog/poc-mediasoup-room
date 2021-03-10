import {
  IonPage,
  IonContent,
  IonSpinner,
} from '@ionic/react'
import CameraSelectorCard from '../components/CameraSelectorCard'
import RoomSelectorCard from '../components/RoomSelectorCard'

function HomePage({
  isConnected,
  hasLocalMediaStream,
  onSubmitSelectedDeviceId,
  onJoinRoom,
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
            <RoomSelectorCard onJoinRoom={onJoinRoom} />
          ) : (
            <IonSpinner />
          )}
        </div>
      </IonContent>
    </IonPage>
  )
}

export default HomePage
