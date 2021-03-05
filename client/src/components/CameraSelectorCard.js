import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonRadio,
  IonRadioGroup,
  IonButton,
} from '@ionic/react'
import { useEffect, useState } from 'react'

function CameraSelectorCard({ onSubmitSelectedDeviceId }) {
  const [isLoading, setIsLoading] = useState(true)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState()

  useEffect(() => {
    if (!isLoading) {
      return
    }

    const enumerateDevices = async () => {
      let dummyStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      })
      dummyStream.getTracks().map((track) => track.stop())
      return (await navigator.mediaDevices.enumerateDevices()).filter(
        (deviceInfo) => deviceInfo.kind === 'videoinput'
      )
    }

    const queryCameras = async () => {
      setAvailableDevices(await enumerateDevices())
      setIsLoading(false)
    }

    queryCameras()
  }, [isLoading])

  useEffect(() => {}, [])

  return (
    <IonCard>
      <IonCardHeader>
        <IonCardTitle>
          {isLoading ? 'Loading cameras' : 'Select a camera'}
        </IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <div className='container'>
          {isLoading ? (
            <IonSpinner />
          ) : availableDevices.length === 0 ? (
            <div>No cameras available.</div>
          ) : (
            <>
              <IonList>
                <IonRadioGroup
                  value={selectedDeviceId}
                  onIonChange={(event) =>
                    setSelectedDeviceId(event.detail.value)
                  }
                >
                  {availableDevices.map((deviceInfo) => (
                    <IonItem key={`camera_${deviceInfo.deviceId}`}>
                      <IonRadio
                        value={deviceInfo.deviceId}
                        slot='start'
                        color='primary'
                      />
                      <IonLabel>{deviceInfo.label}</IonLabel>
                    </IonItem>
                  ))}
                </IonRadioGroup>
              </IonList>
              <IonButton
                disabled={!selectedDeviceId}
                onClick={() => {
                  if (onSubmitSelectedDeviceId) {
                    onSubmitSelectedDeviceId(selectedDeviceId)
                  }
                }}
              >
                Start
              </IonButton>
            </>
          )}
        </div>
      </IonCardContent>
    </IonCard>
  )
}

export default CameraSelectorCard
