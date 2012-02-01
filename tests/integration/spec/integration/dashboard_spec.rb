require File.join(File.expand_path(File.dirname(__FILE__)), '../spec_helper.rb')

#describe 'home page', :type => :request do
describe 'dashboard' do
  it 'allows people to see the connect page' do
    visit '/'
    within_frame 'appFrame' do
      page.should have_content("Nobody Selected")
    end
  end

  it 'should allow people to access the create interface' do
    visit '/'
    click_link 'CREATE'
    page.should have_content('Getting Started')
  end

  it 'should allow access to api explorer' do
    visit '/'
    click_link 'CREATE'
    click_link 'Getting Started'
    within_frame 'appFrame' do
      page.should have_content('Make your own viewer!')
      click_on 'API Explorer'
      page.should have_content('API Explorer')
    end
  end

  it "should allow the user to view all of their apps" do
    visit '/'
    click_link 'see all'
    within_frame 'appFrame' do
      page.should have_content('Hello Links, by Singly, Inc.')
      page.execute_script("$('li[data-id=\"hellolinks\"]').click()")
      page.should have_content('This is example of how easy it is to load your links using HTML and jQuery')
    end
  end

  it "should allow account holders to change their settings" do
    visit '/'
    click_link 'Account Settings'
    page.should have_content('ACCOUNT SETTINGS')
  end

  it "should allow account holders to connect to services (by default)" do
    visit '/'
    click_link 'Account Settings'
    page.should have_content('ACCOUNT SETTINGS')
    page.should have_css('.iframeLink.blue[data-id="connections"]')
  end
end
