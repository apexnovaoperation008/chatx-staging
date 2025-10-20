"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CookieConsent() {
  const [showDialog, setShowDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Cookie检测函数
  const checkCookieSupport = (): boolean => {
    try {
      // 尝试设置测试cookie
      document.cookie = "cookie_test=1; path=/";
      const cookiesEnabled = document.cookie.indexOf("cookie_test=") !== -1;

      if (cookiesEnabled) {
        // 删除测试cookie
        document.cookie = "cookie_test=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  };

  // 检查用户授权cookie
  const checkUserConsent = (): boolean => {
    return document.cookie.includes("user_consent=true");
  };

  // 设置用户授权cookie
  const setUserConsent = () => {
    const expirationDate = new Date();
    expirationDate.setFullYear(expirationDate.getFullYear() + 1); // 1年有效期

    document.cookie = `user_consent=true; path=/; expires=${expirationDate.toUTCString()}; SameSite=Lax`;
    setShowDialog(false);
  };

  // 初始化检查
  useEffect(() => {
    const checkCookies = () => {
      const cookiesSupported = checkCookieSupport();
      const userHasConsented = checkUserConsent();

      if (cookiesSupported && userHasConsented) {
        // Cookie支持且用户已授权，不显示弹窗
        setShowDialog(false);
      } else if (cookiesSupported && !userHasConsented) {
        // Cookie支持但用户未授权，显示弹窗
        setShowDialog(true);
      } else {
        // Cookie不支持，显示弹窗
        setShowDialog(true);
      }

      setIsLoading(false);
    };

    // 延迟执行确保document对象可用
    const timer = setTimeout(checkCookies, 100);
    return () => clearTimeout(timer);
  }, []);

  // 如果还在加载中，不显示任何内容
  if (isLoading) {
    return null;
  }

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="sm:max-w-lg bg-white border-2 border-gray-300 shadow-2xl">
        <DialogHeader className="space-y-4">
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold text-gray-900">
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-full">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
              </svg>
            </div>
            Privacy & Consent Notice
          </DialogTitle>
          <div className="text-left text-gray-700">
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-base leading-relaxed">
                <strong className="text-blue-700">Legal Requirement:</strong> This application requires cookies to function properly and securely.
                By continuing, you acknowledge and consent to the use of necessary cookies for:
              </div>

              <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 ml-4">
                <li>Authentication and session management</li>
                <li>Security and fraud prevention</li>
                <li>Essential system functionality</li>
                <li>Compliance with legal obligations</li>
              </ul>

              {!checkCookieSupport() && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                  <div className="flex items-center gap-2 text-red-700 font-semibold">
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                    </svg>
                    Critical: Cookies are disabled
                  </div>
                  <div className="text-sm text-red-600 mt-2">
                    You must enable cookies in your browser settings to continue using this application.
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-600 border-t border-gray-200 pt-3">
                <strong className="text-gray-800">Data Protection:</strong> Your privacy is protected under applicable data protection laws.
                Only essential cookies are used and no personal data is shared with third parties without consent.
              </div>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="flex gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => {
              // Open browser cookie settings help
              window.open("https://support.google.com/chrome/answer/95647", "_blank");
            }}
            className="border-gray-400 text-gray-700 hover:bg-gray-100 hover:text-gray-900 font-medium"
          >
            Privacy Settings
          </Button>
          <Button
            onClick={setUserConsent}
            className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold px-6 py-2 shadow-lg"
          >
            I Understand & Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
