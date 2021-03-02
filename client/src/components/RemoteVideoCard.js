import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
} from '@ionic/react'
import { useEffect, useRef } from 'react'

function RemoteVideoCard({ remoteStream, title }) {
  const videoEl = useRef(null)

  useEffect(() => {
    if (videoEl.current) {
      videoEl.current.srcObject = remoteStream
    }
  }, [videoEl, remoteStream])

  if (!remoteStream) {
    return null
  }

  return (
    <IonCard>
      {title && (
        <IonCardHeader>
          <IonCardTitle>{title}</IonCardTitle>
        </IonCardHeader>
      )}
      <IonCardContent>
        <video playsInline autoPlay ref={videoEl} className='remoteVideo' />
      </IonCardContent>
    </IonCard>
  )
}

export default RemoteVideoCard
