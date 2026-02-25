import React, { useState, useEffect } from 'react';
import './SharePage.css';
import { getMenuByShareId } from '../utils/menuFirestore';
import MenuDetail from './MenuDetail';

function MenuSharePage({ shareId, currentUser }) {
  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const found = await getMenuByShareId(shareId);
      if (found) {
        setMenu(found);
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [shareId]);

  if (loading) {
    return (
      <div className="share-page-loading">
        Menü wird geladen…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="share-page-not-found">
        <h2>Menü nicht gefunden</h2>
        <p>Dieser Share-Link ist ungültig oder das Menü wurde nicht mehr geteilt.</p>
      </div>
    );
  }

  return (
    <MenuDetail
      menu={menu}
      recipes={[]}
      onBack={() => { window.location.hash = ''; }}
      currentUser={currentUser}
      allUsers={[]}
      isSharedView={true}
    />
  );
}

export default MenuSharePage;
