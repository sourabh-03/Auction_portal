import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AuctionDesk from './pages/team/AuctionDesk';
import ConfigureAuction from './pages/team/ConfigureAuction';
import LiveConsoleInternal from './pages/team/LiveConsoleInternal';
import ResultReview from './pages/team/ResultReview';
import VendorScorecards from './pages/team/VendorScorecards';
import AnalyticsDashboard from './pages/team/AnalyticsDashboard';
import VendorHome from './pages/vendor/VendorHome';
import LiveBidding from './pages/vendor/LiveBidding';
import VendorProfile from './pages/vendor/VendorProfile';
import VendorActivity from './pages/vendor/VendorActivity';

function RequireTeam({ children }: { children: React.ReactElement }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/" replace />;
  if (auth.kind !== 'team') return <Navigate to="/vendor" replace />;
  return children;
}

function RequireVendor({ children }: { children: React.ReactElement }) {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/" replace />;
  if (auth.kind !== 'vendor') return <Navigate to="/desk" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      <Route path="/desk" element={<RequireTeam><AuctionDesk /></RequireTeam>} />
      <Route path="/auctions/new/:threadId" element={<RequireTeam><ConfigureAuction /></RequireTeam>} />
      <Route path="/auctions/:auctionId/configure" element={<RequireTeam><ConfigureAuction /></RequireTeam>} />
      <Route path="/auctions/:auctionId/live" element={<RequireTeam><LiveConsoleInternal /></RequireTeam>} />
      <Route path="/auctions/:auctionId/review" element={<RequireTeam><ResultReview /></RequireTeam>} />
      <Route path="/vendors/scorecards" element={<RequireTeam><VendorScorecards /></RequireTeam>} />
      <Route path="/analytics" element={<RequireTeam><AnalyticsDashboard /></RequireTeam>} />

      <Route path="/vendor" element={<RequireVendor><VendorHome /></RequireVendor>} />
      <Route path="/vendor/profile" element={<RequireVendor><VendorProfile /></RequireVendor>} />
      <Route path="/vendor/activity" element={<RequireVendor><VendorActivity /></RequireVendor>} />
      <Route path="/vendor/auctions/:auctionId" element={<RequireVendor><LiveBidding /></RequireVendor>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
