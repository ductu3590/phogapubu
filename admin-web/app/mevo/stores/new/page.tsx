// admin-web/app/mevo/stores/new/page.tsx
import { Suspense } from 'react'
import StoreWizard from './wizard'

export default function NewStorePage() {
  return (
    <Suspense>
      <StoreWizard />
    </Suspense>
  )
}
