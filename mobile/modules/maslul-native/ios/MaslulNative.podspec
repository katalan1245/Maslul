Pod::Spec.new do |s|
  s.name           = 'MaslulNative'
  s.version        = '1.0.0'
  s.summary        = "Maslul's native helpers"
  s.description    = 'Legacy data read and SIRI snapshot decoding for the Maslul app'
  s.author         = ''
  s.license        = 'AGPL-3.0-only'
  s.homepage       = 'https://github.com/Tom-stack3/Maslul'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
