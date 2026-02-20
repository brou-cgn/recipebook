import React from 'react';
import SearchIcon from './icons/SearchIcon';

const Header = () => {
    return (
        <header>
            <h1>Recipe Book</h1>
            <SearchIcon color="#1a1a1a" size={20} />
        </header>
    );
};

export default Header;