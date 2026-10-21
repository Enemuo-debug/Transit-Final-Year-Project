import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { SignIn } from './pages/SignIn'
import { SignInOrganization } from './pages/SignInOrganization'
import { SignInResponder } from './pages/SignInResponder'
import { SignInDriver } from './pages/SignInDriver'
import { OrgSignup } from './pages/OrgSignup'
import { ResponderSignup } from './pages/ResponderSignup'
import { OrgDashboard } from './pages/OrgDashboard'
import { OrgRoutes } from './pages/OrgRoutes'
import { OrgJourneys } from './pages/OrgJourneys'
import { OrgJourneyDetail } from './pages/OrgJourneyDetail'
import { OrgIncidents } from './pages/OrgIncidents'
import { BusRegistration } from './pages/BusRegistration'
import { DriverDashboard } from './pages/DriverDashboard'
import { ResponderDashboard } from './pages/ResponderDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signin/organization" element={<SignInOrganization />} />
        <Route path="/signin/responder" element={<SignInResponder />} />
        <Route path="/signin/driver" element={<SignInDriver />} />
        <Route path="/signup/organization" element={<OrgSignup />} />
        <Route path="/signup/responder" element={<ResponderSignup />} />
        <Route path="/dashboard/organization" element={<OrgDashboard />} />
        <Route path="/dashboard/organization/routes" element={<OrgRoutes />} />
        <Route path="/dashboard/organization/journeys" element={<OrgJourneys />} />
        <Route path="/dashboard/organization/journeys/:id" element={<OrgJourneyDetail />} />
        <Route path="/dashboard/organization/incidents" element={<OrgIncidents />} />
        <Route path="/dashboard/organization/buses" element={<BusRegistration />} />
        <Route path="/dashboard/driver" element={<DriverDashboard />} />
        <Route path="/dashboard/responder" element={<ResponderDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App