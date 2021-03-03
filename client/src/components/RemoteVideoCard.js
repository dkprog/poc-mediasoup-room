import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonSpinner,
} from '@ionic/react'
import { useEffect, useRef } from 'react'

function RemoteVideoCard({ remoteStream, title }) {
  const videoEl = useRef(null)

  useEffect(() => {
    if (videoEl.current) {
      videoEl.current.srcObject = remoteStream
    }
  }, [videoEl, remoteStream])

  return (
    <IonCard>
      {title && (
        <IonCardHeader>
          <IonCardTitle>{title}</IonCardTitle>
        </IonCardHeader>
      )}
      <IonCardContent>
        {remoteStream ? (
          <video playsInline autoPlay ref={videoEl} className='remoteVideo' />
        ) : (
          <div className='remoteVideoPlaceholder container'>
            <IonSpinner />
          </div>
        )}
      </IonCardContent>
    </IonCard>
  )
}

export default RemoteVideoCard
