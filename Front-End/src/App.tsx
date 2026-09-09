import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Home } from './pages/Home'
import { SignIn } from './pages/SignIn'
import { SignInOrganization } from './pages/SignInOrganization'
import { SignInResponder } from './pages/SignInResponder'
import { OrgSignup } from './pages/OrgSignup'
import { ResponderSignup } from './pages/ResponderSignup'
import { OrgDashboard } from './pages/OrgDashboard'
import { ResponderDashboard } from './pages/ResponderDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signin/organization" element={<SignInOrganization />} />
        <Route path="/signin/responder" element={<SignInResponder />} />
        <Route path="/signup/organization" element={<OrgSignup />} />
        <Route path="/signup/responder" element={<ResponderSignup />} />
        <Route path="/dashboard/organization" element={<OrgDashboard />} />
        <Route path="/dashboard/responder" element={<ResponderDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App