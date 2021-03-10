import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonList,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
  IonButton,
  IonIcon,
} from '@ionic/react'
import { videocam } from 'ionicons/icons'
import { useState } from 'react'

const ROOM_NAMES = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]

function RoomSelectorCard({ onJoinRoom }) {
  const [selectedRoomName, setSelectedRoomName] = useState()

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>Select a room</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <div className='container'>
          <IonList>
            <IonRadioGroup
              value={selectedRoomName}
              onIonChange={(event) => setSelectedRoomName(event.detail.value)}
            >
              {ROOM_NAMES.map((roomName) => (
                <IonItem key={`room_${roomName}`}>
                  <IonRadio value={roomName} slot='start' color='primary' />
                  <IonLabel>{roomName}</IonLabel>
                </IonItem>
              ))}
            </IonRadioGroup>
          </IonList>
          <IonButton
            disabled={!selectedRoomName}
            onClick={() => {
              if (onJoinRoom) {
                onJoinRoom(selectedRoomName)
              }
            }}
          >
            <IonIcon icon={videocam} /> &nbsp; Join{' '}
            {selectedRoomName ? selectedRoomName : 'room'}
          </IonButton>
        </div>
      </IonCardContent>
    </IonCard>
  )
}

export default RoomSelectorCard
