import { useEffect, useState } from 'react';
import Dashboard from './dashboard/Dashboard';
import { parseRoute } from './dashboard/state';
import Landing from './landing/Landing';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const change = () => {
      setRoute(window.location.hash);
      if (window.location.hash.startsWith('#/')) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  return route.startsWith('#/dashboard') ? <Dashboard page={parseRoute(route).page} /> : <Landing />;
}
