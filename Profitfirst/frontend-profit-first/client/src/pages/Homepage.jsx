import Blogsection from "../components/Blogsection";
import FAQ from "../components/FAQ";
import Footer from "../components/Footer";
import Herosection from "../components/Herosection";
import Navbar from "../components/Navbar";
import Pricing from "../components/Pricing";
import FlowSection from "../components/FlowSection";
import TrustedBrandsMarquee from "../components/TrustedBrandsMarquee";
import OurImpact from '../components/Ourimpact';
import Intigration from "../components/Intigration";
import ProfitAnalyticsSection from "../components/ProfitAnalyticsSection";
import PageLoader from "../components/PageLoader";
import { useState, useEffect } from "react";

const Homepage = () => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulate page load
        const timer = setTimeout(() => {
            setLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    if (loading) {
        return <PageLoader />;
    }

    return (
        <div className="bg-[#101218]">
            <Navbar />
            <Herosection/>
            <TrustedBrandsMarquee/>
            <FlowSection/> 
            <OurImpact/>
            <Intigration/>
            <ProfitAnalyticsSection/>
            <Blogsection/> 
            <Pricing/> 
            <FAQ/>
            <Footer/>
        </div>
    )
}

export default Homepage;