import { Route, Routes } from 'react-router-dom'
import { Shell } from './components/layout/Shell'
import About from './pages/About'
import Analyze from './pages/Analyze'
import Results from './pages/Results'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import Report from './pages/Report'
import Styleguide from './pages/Styleguide'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Landing />} />
        <Route path="analyze" element={<Analyze />} />
        <Route path="results" element={<Results />} />
        <Route path="report" element={<Report />} />
        <Route path="about" element={<About />} />
        <Route path="styleguide" element={<Styleguide />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
