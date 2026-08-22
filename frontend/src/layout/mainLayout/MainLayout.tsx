import * as React from 'react';
import Header from '../header/Header';
import SidebarMain from '../sidebar/Sidebar';

interface IMainLayoutProps {
    children: React.ReactElement | React.ReactElement[];
}

const MainLayout = React.memo(({ children }: IMainLayoutProps) => {
    return (
        <div className='main-layout'>
            <div className="flex">
                <div className="sidebar-main relative">
                    <SidebarMain />
                </div>
                <div className='main-content-container'>
                    <div className="header-main">
                        <Header />
                    </div>
                    <div className="relative content-main">
                        {children}
                        {/* <div
                            className="absolute inset-0 bg-right bg-no-repeat bg-contain top-[200px] z-[0]"
                            style={{ backgroundImage: `url(${BGImage})` }}
                        /> */}
                    </div>
                </div>
            </div>
        </div>
    )
})


export default MainLayout;