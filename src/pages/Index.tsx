import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppHeader from '@/components/layout/AppHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { QrCode, FileText, Users, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

const Index = () => {
  const { account, activeStudentProfile, studentProfiles } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Dashboard" />
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {activeStudentProfile?.profile_name}!
          </h1>
          <p className="text-gray-600">
            Ready to continue your learning journey?
          </p>
        </div>

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <QrCode className="h-5 w-5 text-blue-600" />
                Scan Worksheet
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">
                Scan a QR code to access your worksheet
              </p>
              <Link to="/">
                <Button className="w-full bg-gradient-orange-magenta hover:bg-gradient-orange-magenta text-white">
                  Start Scanning
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-green-600" />
                My Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">
                View and manage your saved worksheets
              </p>
              <Button variant="outline" className="w-full" disabled>
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-purple-600" />
                Profiles
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-4">
                {studentProfiles?.length || 0} profile(s) on this account
              </p>
              <Link to="/profile-selection">
                <Button variant="outline" className="w-full">
                  Manage Profiles
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-600">Account Email</p>
                <p className="text-gray-900">{account?.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Credits Remaining</p>
                <p className="text-gray-900">{account?.credits_remaining || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Active Profile</p>
                <p className="text-gray-900">{activeStudentProfile?.profile_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;