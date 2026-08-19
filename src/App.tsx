import { Navigate, Route, Routes } from 'react-router-dom'
import { useStore } from './data/store'
import { AppShell } from './components/AppShell'
import { Tour } from './components/Tour'
import SignIn from './screens/SignIn'
import Dashboard from './screens/Dashboard'
import Contacts from './screens/Contacts'
import ContactImport from './screens/ContactImport'
import Properties from './screens/Properties'
import Deals from './screens/Deals'
import Activities from './screens/Activities'
import Reports from './screens/Reports'
import Team from './screens/Team'
import Settings from './screens/Settings'
import Payments from './screens/Payments'
import WebLeads from './screens/WebLeads'

export default function App() {
  const signedIn = useStore((s) => s.signedIn)

  if (!signedIn) return <SignIn />

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/import" element={<ContactImport />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/web-leads" element={<WebLeads />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>
      <Tour />
    </>
  )
}
