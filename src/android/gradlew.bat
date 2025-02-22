@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%"=="" @echo off
@rem ##########################################################################
@rem
@rem  Gradle startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem This is normally unused
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Validate and setup JAVA_HOME with enhanced error messages
if not "%JAVA_HOME%"=="" goto validateJavaHome
echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation (minimum version 1.8 required).
goto fail

:validateJavaHome
@rem Validate JAVA_HOME directory exists
if exist "%JAVA_HOME%\bin\java.exe" goto init
echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation (minimum version 1.8 required).
goto fail

:init
@rem Configure default JVM options with optimized memory settings
set DEFAULT_JVM_OPTS="-Xmx1g" "-Xms512m" "-XX:MaxMetaspaceSize=256m" "-Dfile.encoding=UTF-8"

@rem Find java.exe
set JAVA_EXE="%JAVA_HOME%\bin\java.exe"

@rem Add proxy support from GRADLE_OPTS if defined
if not "%GRADLE_OPTS%"=="" set DEFAULT_JVM_OPTS=%DEFAULT_JVM_OPTS% %GRADLE_OPTS%

@rem Add JAVA_OPTS if defined
if not "%JAVA_OPTS%"=="" set DEFAULT_JVM_OPTS=%DEFAULT_JVM_OPTS% %JAVA_OPTS%

@rem Setup security and SSL configurations
set DEFAULT_JVM_OPTS=%DEFAULT_JVM_OPTS% "-Dhttps.protocols=TLSv1.2,TLSv1.3"
set DEFAULT_JVM_OPTS=%DEFAULT_JVM_OPTS% "-Dorg.gradle.internal.https.validateDistributionUrl=true"

@rem Find the project base dir
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

@rem Execute Gradle with enhanced error handling
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% ^
  "-Dorg.gradle.appname=%APP_BASE_NAME%" ^
  -classpath "%CLASSPATH%" ^
  org.gradle.wrapper.GradleWrapperMain %*
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable GRADLE_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if not "" == "%GRADLE_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega