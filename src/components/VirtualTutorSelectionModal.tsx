import React from "react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface VirtualTutor {
  id: string;
  name: string;
  imageSrc: string;
  videoSrc: string;
}

const VIRTUAL_TUTORS: VirtualTutor[] = [
  {
    id: "tutor1",
    name: "Virtual Tutor 1",
    imageSrc: "/video/1.jpg",
    videoSrc: "/video/1.mp4"
  },
  {
    id: "tutor2", 
    name: "Virtual Tutor 2",
    imageSrc: "/video/2.jpg",
    videoSrc: "/video/2.mp4"
  }
];

interface VirtualTutorSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTutor: (videoSrc: string) => void;
}

const VirtualTutorSelectionModal: React.FC<VirtualTutorSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectTutor
}) => {
  const { t } = useTranslation();
  const [isI18nReady, setIsI18nReady] = useState(false);

  // Wait for i18next to be ready before rendering translated content
  useEffect(() => {
    if (i18n.isInitialized) {
      setIsI18nReady(true);
    } else {
      const handleInitialized = () => {
        setIsI18nReady(true);
      };
      
      i18n.on('initialized', handleInitialized);
      
      return () => {
        i18n.off('initialized', handleInitialized);
      };
    }
  }, []);

  const handleTutorClick = (videoSrc: string) => {
    onSelectTutor(videoSrc);
  };

  // Show loading while i18next is initializing
  if (!isI18nReady) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md mx-auto">
          <div className="text-center p-4">
            <p className="text-lg">Loading...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-center" dir={t('common.language') === 'العربية' ? 'rtl' : 'ltr'}>{t('virtualTutor.selectTitle')}</DialogTitle>
          <DialogDescription className="text-center" dir={t('common.language') === 'العربية' ? 'rtl' : 'ltr'}>
            {t('virtualTutor.selectDescription')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 p-4">
          {VIRTUAL_TUTORS.map((tutor) => (
            <div
              key={tutor.id}
              className="w-32 h-32 cursor-pointer rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200 overflow-hidden mx-auto"
              onClick={() => handleTutorClick(tutor.videoSrc)}
            >
              <img
                src={tutor.imageSrc}
                alt={tutor.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback if image fails to load
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
        
        <div className="flex justify-center p-4">
          <Button 
            onClick={onClose}
            variant="outline"
            className="px-6"
            dir={t('common.language') === 'العربية' ? 'rtl' : 'ltr'}
          >
            {t('virtualTutor.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VirtualTutorSelectionModal;